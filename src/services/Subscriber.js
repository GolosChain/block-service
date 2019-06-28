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
            lastSequence: (meta && meta.lastProcessedSequence) || 0,
            lastTime: (meta && meta.lastProcessedTime) || null,
            // includeExpired: true,
        });

        await this._subscriber.start();

        this._subscriber.eachBlock(this._handleNewBlock.bind(this));

        this._subscriber.on(
            'irreversibleBlockNum',
            this._setIrreversibleBlockNum.bind(this)
        );
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
                'counters.transactionsTotal': 1,
            },
            {
                lean: true,
            }
        );

        let transactions = null;
        const counters = this._calcBlockCounters(block, parentBlock);
        const blockCodes = {
            codes: {},
            actions: {},
            codeActions: {},
        };

        if (block.transactions.length) {
            transactions = block.transactions.map((trx, index) => {
                const {
                    codes,
                    actions,
                    codeActions,
                } = this._extractionActionsInfo(trx, blockCodes);

                return {
                    ...trx,
                    index,
                    blockId: block.id,
                    blockNum: block.blockNum,
                    blockTime: block.blockTime,
                    actionsCount: trx.actions.length,
                    actionCodes: {
                        codes,
                        actions,
                        codeActions,
                    },
                };
            });
        }

        const codes = Object.keys(blockCodes.codes);
        const actions = Object.keys(blockCodes.actions);
        const codeActions = Object.keys(blockCodes.codeActions);

        const blockModel = new BlockModel({
            id: block.id,
            parentId: block.parentId,
            blockNum: block.blockNum,
            blockTime: block.blockTime,
            transactionIds: block.transactions.map(
                transaction => transaction.id
            ),
            counters,
            codes,
            actions,
            codeActions,
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
        // console.log(
        //     `new block ${block.blockNum} saved, seq: ${block.sequence}, trx: ${block.transactions.length}`
        // );
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

    async _setIrreversibleBlockNum(irreversibleBlockNum) {
        try {
            await ServiceMetaModel.updateOne(
                {},
                {
                    $set: {
                        irreversibleBlockNum,
                    },
                }
            );
        } catch (err) {
            Logger.error('ServiceMeta saving failed:', err);
        }
    }

    _calcBlockCounters(block, parentBlock) {
        const parentTotals = parentBlock
            ? { ...parentBlock.counters.transactionsTotal }
            : { executed: 0, total: 0 };

        const stats = {
            transactions: {
                executed: 0,
                total: block.transactions.length,
            },
            transactionsTotal: parentTotals,
        };

        stats.transactionsTotal.total += block.transactions.length;

        const tStats = stats.transactions;
        const ttStats = stats.transactionsTotal;

        for (const transaction of block.transactions) {
            tStats[transaction.status] = tStats[transaction.status] || 0;
            tStats[transaction.status]++;

            ttStats[transaction.status] = ttStats[transaction.status] || 0;
            ttStats[transaction.status]++;
        }

        return stats;
    }

    _extractionActionsInfo(transaction, blockCodes) {
        const actions = {};
        const codes = {};
        const codeActions = {};

        for (const { code, action } of transaction.actions) {
            const codeAction = `${code}::${action}`;

            codes[code] = true;
            actions[action] = true;
            codeActions[codeAction] = true;

            blockCodes.codes[code] = true;
            blockCodes.actions[action] = true;
            blockCodes.codeActions[codeAction] = true;
        }

        return {
            codes: Object.keys(codes),
            actions: Object.keys(actions),
            codeActions: Object.keys(codeActions),
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
}

module.exports = Subscriber;
