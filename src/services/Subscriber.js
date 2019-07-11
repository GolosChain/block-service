const core = require('gls-core-service');
const { splitEvery } = require('ramda');
const BasicService = core.services.Basic;
const { Logger } = core.utils;
const BlockSubscribe = core.services.BlockSubscribe;
const metrics = core.utils.metrics;
const BlockModel = require('../models/Block');
const ServiceMetaModel = require('../models/ServiceMeta');
const TransactionModel = require('../models/Transaction');
const ActionVariantModel = require('../models/ActionVariant');

class Subscriber extends BasicService {
    async start() {
        await super.start();

        const meta = await ServiceMetaModel.findOne({}, {}, { lean: true });

        this._subscriber = new BlockSubscribe({
            handler: this._handleEvent.bind(this),
        });

        await this._subscriber.setLastBlockMetaData({
            lastBlockNum: meta.lastProcessedBlockNum,
            lastBlockSequence: meta.lastProcessedSequence || 0,
        });

        await this._subscriber.start();
    }

    /**
     * Обработка событий из BlockSubscribe.
     * @param {'BLOCK'|'FORK'|'IRREVERSIBLE_BLOCK'} type
     * @param {Object} data
     * @private
     */
    async _handleEvent({ type, data }) {
        switch (type) {
            case 'BLOCK':
                await this._handleNewBlock(data);
                break;
            case 'IRREVERSIBLE_BLOCK':
                await this._setIrreversibleBlockNum(data);
                break;
            case 'FORK':
                Logger.warn(
                    `Fork detected, new safe base on block num: ${data.baseBlockNum}`
                );
                await this._deleteInvalidEntries(data.baseBlockNum);
                break;
            default:
        }
    }

    /**
     * Обработка нового блока.
     * @param {Object} block
     * @private
     */
    async _handleNewBlock(block) {
        const parentBlock = await BlockModel.findOne(
            {
                id: block.parentId,
            },
            {
                'counters.total': 1,
            },
            {
                lean: true,
            }
        );

        let transactions = null;
        const blockIndexes = {
            codes: {},
            actions: {},
            codeActions: {},
            actors: {},
            actorsPerm: {},
            eventNames: {},
        };

        if (block.transactions.length) {
            transactions = block.transactions.map((trx, index) => {
                const {
                    codes,
                    actions,
                    codeActions,
                    actors,
                    actorsPerm,
                    eventNames,
                } = this._extractionActionsInfo(trx, blockIndexes);

                return {
                    ...trx,
                    index,
                    blockId: block.id,
                    blockNum: block.blockNum,
                    blockTime: block.blockTime,
                    actionsCount: trx.actions.length,
                    actionsIndexes: {
                        codes,
                        actions,
                        codeActions,
                        actors,
                        actorsPerm,
                        eventNames,
                    },
                };
            });
        }

        const codeActions = Object.keys(blockIndexes.codeActions);

        const counters = this._calcBlockCounters(
            block,
            transactions,
            parentBlock
        );

        const blockModel = new BlockModel({
            id: block.id,
            parentId: block.parentId,
            blockNum: block.blockNum,
            blockTime: block.blockTime,
            transactionIds: block.transactions.map(
                transaction => transaction.id
            ),
            counters,
            codes: Object.keys(blockIndexes.codes),
            actions: Object.keys(blockIndexes.actions),
            codeActions,
            actors: Object.keys(blockIndexes.actors),
            actorsPerm: Object.keys(blockIndexes.actorsPerm),
            eventNames: Object.keys(blockIndexes.eventNames),
        });

        try {
            await blockModel.save();

            metrics.inc('saved_blocks_count');
        } catch (err) {
            // В случае дубликации ничего не делаем.
            if (!(err.name === 'MongoError' && err.code === 11000)) {
                throw err;
            }
        }

        for (const codeAction of codeActions) {
            const [code, action] = codeAction.split('::');

            try {
                await ActionVariantModel.create({
                    code,
                    action,
                    appearInBlockId: block.id,
                });
            } catch (err) {
                // В случае дубликации ничего не делаем, в случае ошибки уведомляем без падения.
                if (!(err.name === 'MongoError' && err.code === 11000)) {
                    Logger.warn('Cant save ActionVariant:', err);
                }
            }
        }

        if (transactions) {
            try {
                await this._saveTransactions(transactions);
            } catch (err) {
                // В случае дубликации начинаем сохранять транзакции по одной игнорируя дубликаты
                if (err.name === 'BulkWriteError' && err.code === 11000) {
                    await this._saveTransactionsSeparately(transactions);
                } else {
                    throw err;
                }
            }

            await this._extractAndSaveUsers(block);
        }

        await ServiceMetaModel.updateOne(
            {},
            {
                $set: {
                    lastProcessedSequence: block.sequence,
                    lastProcessedTime: block.blockTime,
                },
            }
        );

        // TODO: remove
        console.log(
            `new block ${block.blockNum} saved, seq: ${block.sequence}, trx: ${block.transactions.length}`
        );
    }

    async _saveTransactions(transactions) {
        const chunks = splitEvery(100, transactions);

        for (const chunk of chunks) {
            await TransactionModel.insertMany(chunk);
        }

        metrics.inc('saved_transactions_count', transactions.length);
    }

    async _saveTransactionsSeparately(transactions) {
        for (const trx of transactions) {
            try {
                await TransactionModel.create(trx);

                metrics.inc('saved_transactions_count');
            } catch (err) {
                // В случае дублирования ничего не делаем.
                if (err.name === 'MongoError' && err.code === 11000) {
                    continue;
                }

                throw err;
            }
        }
    }

    async _setIrreversibleBlockNum(block) {
        try {
            await ServiceMetaModel.updateOne(
                {},
                {
                    $set: {
                        irreversibleBlockNum: block.blockNum,
                    },
                }
            );
        } catch (err) {
            Logger.error('ServiceMeta saving failed:', err);
        }
    }

    _calcBlockCounters(block, transactions, parentBlock) {
        const stats = {
            accounts: {
                created: 0,
            },
            transactions: {
                executed: 0,
                total: block.transactions.length,
            },
            actions: {
                count: 0,
            },
        };

        const tStats = stats.transactions;

        if (transactions) {
            for (const transaction of transactions) {
                tStats[transaction.status] = tStats[transaction.status] || 0;
                tStats[transaction.status]++;

                if (transaction.status === 'executed') {
                    stats.actions.count += transaction.actions.length;

                    for (const action of transaction.actions) {
                        if (
                            action.code === 'cyber' &&
                            action.action === 'newaccount'
                        ) {
                            stats.accounts.created++;
                        }
                    }
                }
            }
        }

        return {
            current: stats,
            total: this._mergeStats(
                parentBlock ? parentBlock.counters.total : null,
                stats
            ),
        };
    }

    _extractionActionsInfo(transaction, blockIndexes) {
        const actions = {};
        const codes = {};
        const codeActions = {};
        const actors = {};
        const actorsPerm = {};
        const eventNames = {};

        for (const { code, action, auth, events } of transaction.actions) {
            const codeAction = `${code}::${action}`;

            codes[code] = true;
            actions[action] = true;
            codeActions[codeAction] = true;

            blockIndexes.codes[code] = true;
            blockIndexes.actions[action] = true;
            blockIndexes.codeActions[codeAction] = true;

            if (auth) {
                for (const { actor, permission } of auth) {
                    const actorPerm = `${actor}/${permission}`;

                    actors[actor] = true;
                    actorsPerm[actorPerm] = true;

                    blockIndexes.actors[actor] = true;
                    blockIndexes.actorsPerm[actorPerm] = true;
                }
            }

            if (events) {
                for (const event of events) {
                    eventNames[event.event] = true;
                    blockIndexes.eventNames[event.event] = true;

                    if (event.data === '') {
                        event.data = undefined;
                    }
                }
            }
        }

        return {
            codes: Object.keys(codes),
            actions: Object.keys(actions),
            codeActions: Object.keys(codeActions),
            actors: Object.keys(actors),
            actorsPerm: Object.keys(actorsPerm),
            eventNames: Object.keys(eventNames),
        };
    }

    _combineActions(transactions) {
        const actions = {};
        const codes = {};
        const codeActions = {};

        for (const transaction of transactions) {
            for (const code of transaction.codes) {
                codes[code] = true;
            }
            for (const action of transaction.actions) {
                actions[action] = true;
            }
            for (const codeAction of transaction.codeActions) {
                codeActions[codeAction] = true;
            }
        }

        return {
            codes: Object.keys(codes),
            actions: Object.keys(actions),
            codeActions: Object.keys(codeActions),
        };
    }

    async _deleteInvalidEntries(baseBlockNum) {
        Logger.info(`Deleting all entries above block num: ${baseBlockNum}`);

        await BlockModel.deleteMany({
            blockNum: {
                $gt: baseBlockNum,
            },
        });

        await TransactionModel.deleteMany({
            blockNum: {
                $gt: baseBlockNum,
            },
        });
    }

    async _extractAndSaveUsers(block) {
        // Not ready yet
        return;

        const mentions = [];

        for (const transaction of block.transactions) {
            for (let i = 0; i < transaction.actions.length; i++) {
                const action = transaction.actions[i];

                if (!action.args) {
                    continue;
                }

                const method = `${action.code}->${action.action}`;

                const { args } = action;

                const base = {
                    blockId: block.id,
                    transactionId: transaction.id,
                    actionIndex: i,
                };

                switch (method) {
                    case 'cyber->newaccount':
                        mentions.push(
                            {
                                ...base,
                                userId: args.creator,
                            },
                            {
                                ...base,
                                userId: args.name,
                            }
                        );
                        break;
                    default:
                        Logger.info(`Unhandled bc method ${method}:`, action);
                }
            }
        }
    }

    _mergeStats(a, b) {
        if (!a) {
            return b;
        }

        if (!b) {
            return a;
        }

        const stats = {};

        for (const category of Object.keys(b)) {
            const aa = a[category];
            const bb = b[category];

            const sum = { ...aa } || {};

            for (const field of Object.keys(bb)) {
                sum[field] = (sum[field] || 0) + bb[field];
            }

            stats[category] = sum;
        }

        return stats;
    }
}

module.exports = Subscriber;
