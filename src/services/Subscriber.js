const core = require('gls-core-service');
const { chunk: chunkSplit } = require('lodash');
const BasicService = core.services.Basic;
const { Logger } = core.utils;
const BlockSubscribe = core.services.BlockSubscribe;
const metrics = core.utils.metrics;
const BlockModel = require('../models/Block');
const ServiceMetaModel = require('../models/ServiceMeta');
const TransactionModel = require('../models/Transaction');
const AccountPathModel = require('../models/AccountPath');
const AccountModel = require('../models/Account');
const CyberwayClient = require('../utils/Cyberway');
const AccountPathsCache = require('../utils/AccountPathsCache');
const { extractByPath } = require('../utils/common');

class Subscriber extends BasicService {
    async start() {
        await super.start();

        const meta = await ServiceMetaModel.findOne({}, {}, { lean: true });

        this._accountPathsCache = new AccountPathsCache();

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
            transactions = [];

            await Promise.all(
                block.transactions.map(async (trx, index) => {
                    const {
                        codes,
                        actions,
                        codeActions,
                        actors,
                        actorsPerm,
                        accounts,
                        eventNames,
                    } = await this._extractionActionsInfo(trx, blockIndexes);

                    transactions.push({
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
                            accounts,
                            eventNames,
                        },
                    });
                })
            );
        }

        const { counters, newAccounts } = this._calcBlockCounters(
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
            codeActions: Object.keys(blockIndexes.codeActions),
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

        if (newAccounts.length) {
            await this._saveNewAccounts(newAccounts, block);
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

        await this._extractAndSaveAccountPaths(block);

        // TODO: remove
        console.log(
            `new block ${block.blockNum} saved, seq: ${block.sequence}, trx: ${block.transactions.length}`
        );
    }

    async _saveTransactions(transactions) {
        const chunks = chunkSplit(transactions, 100);

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

        const newAccounts = [];

        const tStats = stats.transactions;

        if (transactions) {
            for (const transaction of transactions) {
                tStats[transaction.status] =
                    (tStats[transaction.status] || 0) + 1;

                stats.actions.count += transaction.actions.length;

                for (const action of transaction.actions) {
                    if (
                        action.code === 'cyber' &&
                        action.action === 'newaccount'
                    ) {
                        stats.accounts.created++;

                        const { args } = action;

                        newAccounts.push({
                            id: args.name,
                            keys: {
                                owner: args.owner,
                                active: args.active,
                            },
                        });
                    }
                }
            }
        }

        return {
            counters: {
                current: stats,
                total: this._mergeStats(
                    parentBlock ? parentBlock.counters.total : null,
                    stats
                ),
            },
            newAccounts,
        };
    }

    async _extractionActionsInfo(transaction, blockIndexes) {
        const actions = {};
        const codes = {};
        const codeActions = {};
        const actors = {};
        const actorsPerm = {};
        const accounts = {};
        const eventNames = {};

        for (const actionObject of transaction.actions) {
            const { code, action, auth, args, events } = actionObject;

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

            if (actionObject.data === '') {
                actionObject.data = undefined;
            }

            if (args) {
                const actionAccounts = await this._extractAccounts({
                    code,
                    action,
                    args,
                });

                actionObject.accounts = Object.keys(actionAccounts);
                Object.assign(accounts, actionAccounts);
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
            accounts: Object.keys(accounts),
            eventNames: Object.keys(eventNames),
        };
    }

    async _deleteInvalidEntries(baseBlockNum) {
        Logger.info(`Deleting all entries above block num: ${baseBlockNum}`);

        const condition = {
            blockNum: {
                $gt: baseBlockNum,
            },
        };

        await BlockModel.deleteMany(condition);
        await TransactionModel.deleteMany(condition);
        await AccountModel.deleteMany(condition);
        await AccountPathModel.deleteMany(condition);

        this._accountPathsCache.deleteNewerThanBlockNum(baseBlockNum);
    }

    async _extractAccounts({ code, action, args }) {
        const accounts = {};

        if (code === 'cyber.token') {
            switch (action) {
                case 'bulktransfer':
                    accounts[args.from] = true;

                    for (const { memo } of args.recipients) {
                        const match = memo.match(/^send to: ([a-z0-5.]+);/);

                        if (!match) {
                            Logger.warn(
                                'bulktransfer without account in memo:',
                                args
                            );
                            continue;
                        }

                        accounts[match[1]] = true;
                    }

                    return accounts;
            }
        }

        const paths = await this._accountPathsCache.get(code, action);

        if (!paths) {
            return {};
        }

        for (const path of paths) {
            const accountsList = extractByPath(args, path);

            for (const account of accountsList) {
                accounts[account] = true;
            }
        }

        return accounts;
    }

    async _extractAndSaveAccountPaths(block) {
        const accounts = {};

        for (const transaction of block.transactions) {
            for (const action of transaction.actions) {
                if (
                    action.code === 'cyber' &&
                    action.receiver === 'cyber' &&
                    action.action === 'setabi'
                ) {
                    try {
                        const { account, entries } = this._extractAccountPaths(
                            action,
                            block.blockNum
                        );

                        accounts[account] = entries;
                    } catch (err) {
                        Logger.error(
                            `Can't process contact abi.`,
                            { blockNum: block.blockNum },
                            err
                        );
                    }
                }
            }
        }

        // const { account, entries } = this._extractAccountPaths(
        //     {
        //         receiver: 'cyber',
        //         code: 'cyber',
        //         action: 'setabi',
        //         auth: [
        //             {
        //                 actor: 'tst2daaomswq',
        //                 permission: 'active',
        //             },
        //         ],
        //         args: {
        //             account: 'tst2daaomswq',
        //             abi:
        //                 '1163796265727761793a3a6162692f312e3100060f70696e626c6f636b5f7265636f72640003076163636f756e74046e616d650770696e6e696e6704626f6f6c08626c6f636b696e6704626f6f6c0b6163636f756e746d6574610020047479706507737472696e673f0361707007737472696e673f05656d61696c07737472696e673f0570686f6e6507737472696e673f0866616365626f6f6b07737472696e673f09696e7374616772616d07737472696e673f0874656c656772616d07737472696e673f02766b07737472696e673f08776861747361707007737472696e673f0677656368617407737472696e673f077765627369746507737472696e673f0a66697273745f6e616d6507737472696e673f096c6173745f6e616d6507737472696e673f046e616d6507737472696e673f0a62697274685f6461746507737472696e673f0667656e64657207737472696e673f086c6f636174696f6e07737472696e673f046369747907737472696e673f0561626f757407737472696e673f0a6f636375706174696f6e07737472696e673f05695f63616e07737472696e673f0b6c6f6f6b696e675f666f7207737472696e673f11627573696e6573735f63617465676f727907737472696e673f106261636b67726f756e645f696d61676507737472696e673f0b636f7665725f696d61676507737472696e673f0d70726f66696c655f696d61676507737472696e673f0a757365725f696d61676507737472696e673f0b69636f5f6164647265737307737472696e673f0b7461726765745f6461746507737472696e673f0b7461726765745f706c616e07737472696e673f0e7461726765745f706f696e745f6107737472696e673f0e7461726765745f706f696e745f6207737472696e673f0370696e00020670696e6e6572046e616d650770696e6e696e67046e616d6505626c6f636b000207626c6f636b6572046e616d6508626c6f636b696e67046e616d650a7570646174656d6574610002076163636f756e74046e616d65046d6574610b6163636f756e746d6574610664656c6574650001076163636f756e74046e616d6506000000000000a6ab0370696e0000000080e9ead40370696e000000000088683c05626c6f636b00000000221acfd405626c6f636b0080c94aaa6c52d50a7570646174656d6574610080c94aaaaca24a0664656c657465000100000010d178a6ab0f70696e626c6f636b5f7265636f72640001000000c05f23ddad0101076163636f756e7403617363000000',
        //         },
        //     },
        //     block.blockNum
        // );
        // accounts[account] = entries;

        for (const account of Object.keys(accounts)) {
            const entries = accounts[account];

            try {
                await AccountPathModel.insertMany(entries);
                this._accountPathsCache.delete(account);
            } catch (err) {
                if (err.name === 'BulkWriteError' && err.code === 11000) {
                    // Do nothing
                } else {
                    throw err;
                }
            }
        }
    }

    _extractAccountPaths(action, blockNum) {
        const { account, abi: hexAbi } = action.args;

        const entries = [];

        const buffer = Buffer.from(hexAbi, 'hex');
        const abi = CyberwayClient.get().rawAbiToJson(buffer);

        for (const { name, type } of abi.actions) {
            const struct = abi.structs.find(({ name }) => name === type);

            if (struct.base) {
                Logger.error('Unsupported case, structure with base:', struct);
            }

            entries.push({
                account,
                blockNum,
                action: name,
                accountPaths: struct.fields
                    .filter(field => field.type === 'name')
                    .map(field => field.name),
            });
        }

        return {
            account,
            entries,
        };
    }

    async _saveNewAccounts(accounts, block) {
        await Promise.all(
            accounts.map(async ({ id, keys }) => {
                const accountModel = new AccountModel({
                    blockId: block.id,
                    blockNum: block.blockNum,
                    blockTime: block.blockTime,
                    registrationTime: block.blockTime,
                    id,
                    keys,
                });

                try {
                    await accountModel.save();
                } catch (err) {
                    // В случае дубликации ничего не делаем.
                    if (!(err.name === 'MongoError' && err.code === 11000)) {
                        throw err;
                    }
                }
            })
        );
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
