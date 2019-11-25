const core = require('cyberway-core-service');
const { chunk: chunkSplit } = require('lodash');
const BasicService = core.services.Basic;
const { Logger } = core.utils;
const LogModel = require('../models/Log');
const BlockSubscribe = core.services.BlockSubscribe;
const metrics = core.utils.metrics;
const BlockModel = require('../models/Block');
const ServiceMetaModel = require('../models/ServiceMeta');
const TransactionModel = require('../models/Transaction');
const AccountPathModel = require('../models/AccountPath');
const AccountModel = require('../models/Account');
const AccountBucketModel = require('../models/AccountBucket');
const TokenBalanceModel = require('../models/TokenBalance');
const ProposalModel = require('../models/Proposal');
const Schedule = require('../controllers/Schedule');
const CyberwayClient = require('../utils/Cyberway');
const AccountPathsCache = require('../utils/AccountPathsCache');
const { extractByPath, saveModelIgnoringDups, dateToBucketId } = require('../utils/common');

class Subscriber extends BasicService {
    async start() {
        await super.start();

        const meta = await ServiceMetaModel.findOne({}, {}, { lean: true });

        this._accountPathsCache = new AccountPathsCache();
        this._schedule = new Schedule();

        this._subscriber = new BlockSubscribe({
            handler: this._handleEvent.bind(this),
            captureProducers: true,
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
                await this._handleIrreversibleBlock(data);
                break;
            case 'FORK':
                Logger.warn(`Fork detected, new safe base on block num: ${data.baseBlockNum}`);
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

        const { counters, storage } = this._exrtractStorables(block, transactions, parentBlock);
        const newSchedule = block.schedule.toString() !== block.nextSchedule.toString();
        const nextSchedule = newSchedule ? block.nextSchedule : undefined;

        const blockModel = new BlockModel({
            id: block.id,
            parentId: block.parentId,
            blockNum: block.blockNum,
            blockTime: block.blockTime,
            producer: block.producer,
            schedule: block.schedule,
            nextSchedule,
            transactionIds: block.transactions.map(transaction => transaction.id),
            counters,
            codes: Object.keys(blockIndexes.codes),
            actions: Object.keys(blockIndexes.actions),
            codeActions: Object.keys(blockIndexes.codeActions),
            actors: Object.keys(blockIndexes.actors),
            actorsPerm: Object.keys(blockIndexes.actorsPerm),
            eventNames: Object.keys(blockIndexes.eventNames),
        });

        await saveModelIgnoringDups(blockModel);

        const bucket = {
            bucket: dateToBucketId(block.blockTime),
            account: block.producer,
        };

        await AccountBucketModel.updateOne(
            bucket,
            {
                $inc: { blocksCount: 1 },
                $set: bucket,
            },
            { upsert: true }
        );

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
        }

        await this._saveStorage(storage, block);

        await ServiceMetaModel.updateOne(
            {},
            {
                $set: {
                    lastProcessedBlockNum: block.blockNum,
                    lastProcessedSequence: block.sequence,
                },
            }
        );

        await this._extractAndSaveAccountPaths(block);
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

    async _detectMissedBlocks(block) {
        await this._schedule.processBlock(block);
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

    _extractTransactionStorables(transactions, handlers, storage, stats) {
        for (const transaction of transactions || []) {
            for (const action of transaction.actions) {
                const contractHandlers = handlers[action.code];
                if (!contractHandlers) {
                    continue;
                }

                const handler = contractHandlers[action.action];
                if (handler) {
                    handler.bind(this)(action, storage, stats);
                }

                const eventsHandlers = contractHandlers.EVENTS;
                if (eventsHandlers) {
                    for (const event of action.events) {
                        if (event.code !== action.code) {
                            // not required for now
                            continue;
                        }

                        const handler = eventsHandlers[event.event];
                        if (handler) {
                            handler.bind(this)(event, storage, stats);
                        }
                    }
                }
            }
        }
    }

    async _handleIrreversibleBlock(block) {
        await this._setIrreversibleBlockNum(block);

        // здесь не нужно realtime-обновление, поэтому проще ловить пропуски уже на irrevervible
        await this._detectMissedBlocks(block);

        const storage = {
            proposals: {},

            _blockNum: block.blockNum,
            _blockTime: block.blockTime,
        };
        const handlers = {
            'cyber.msig': {
                propose: this._msigPropose,
                approve: this._msigUpdate,
                unapprove: this._msigUpdate,
                cancel: this._msigFinish,
                exec: this._msigFinish,
                invalidate: () => {
                    // invalidate is quite tricky to handle here.
                    // TODO: ?store msig invalidations to lookup at proposal finish
                    this._log({ message: 'msig invalidation', blockNum: block.blockNum });
                },
            },
        };
        this._extractTransactionStorables(block.transactions, handlers, storage);
        await this._saveIrrStorage(storage, block);
    }

    _newAccountAction(action, storage, stats) {
        const { args } = action;
        const { creator, name, owner, active } = args;

        storage.newAccounts.push({
            id: name,
            keys: { owner, active },
            creator,
        });
        stats.accounts.created++;
    }

    _newUsernameAction(action, storage) {
        const { args } = action;
        const { owner, name } = args;
        const account = storage.newAccounts.find(({ id }) => id === owner);

        if (account) {
            account.golosId = name;
            Logger.log(`Adding username "${name}" to ${owner}`);
        } else {
            this._log({
                message: `can't add username "${name}": no account "${owner}" in current trx`,
                blockNum: storage._blockTime,
            });
        }
    }

    _updateBalanceEvent(event, storage) {
        const { account, balance, payments } = event.args;
        const symbol = balance.split(' ')[1];
        const key = `${account} ${symbol}`;

        storage.balances[key] = {
            account,
            symbol,
            balance,
            payments,
        };
    }

    _levelStr({ actor, permission }) {
        return `${actor}@${permission}`;
    }

    _msigPropose(action, storage) {
        const { args } = action;
        const { proposer, proposal_name: name, requested, trx } = args;
        const proposal = {
            proposer,
            name,
            trx,
            blockNum: storage._blockNum,
            approvals: requested.map(x => ({ level: this._levelStr(x) })),
            expires: new Date(trx.expiration + 'Z'),
        };
        const key = `${proposer}-${name}`;

        if (storage.proposals[key]) {
            // TODO: fix rare case where proposal created, finalized and created again in 1 block (only last stored)
            this._log({
                message: `Proposal override: ${proposer}/${name}`,
                blockNum: storage._blockNum,
            });
        }
        storage.proposals[key] = proposal;
    }

    _msigUpdate(action, storage) {
        const { args } = action;
        const { proposer, proposal_name: name, level, proposal_hash } = args;
        const key = `${proposer}-${name}`;
        const p = storage.proposals[key] || { proposer, name, approvals: [] };
        const lvl = this._levelStr(level);
        const approval = {
            level: lvl,
            status: proposal_hash ? 'approve+' : action.action, // special mark when approved with hash
            time: storage._blockTime,
        };
        const idx = p.approvals.findIndex(x => x.level === lvl);

        if (idx >= 0) {
            p.approvals[idx] = approval;
        } else {
            p.approvals.push(approval);
        }
        p.updateTime = storage._blockTime;
        storage.proposals[key] = p;
    }

    _msigFinish(action, storage) {
        const { args } = action;
        const { proposer, proposal_name: name, executer } = args;
        const key = `${proposer}-${name}`;
        const p = storage.proposals[key] || { proposer, name };

        p.finalStatus = action.action;
        p.updateTime = storage._blockTime;
        if (executer) {
            p.execTrxId = '?'; // TODO
        }
        storage.proposals[key] = p;
    }

    _exrtractStorables(block, transactions, parentBlock) {
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
        for (const transaction of transactions || []) {
            tStats[transaction.status] = (tStats[transaction.status] || 0) + 1;
            stats.actions.count += transaction.actions.length;
        }

        const storage = {
            newAccounts: [],
            balances: {}, // updates if several balance changes in one block

            _blockNum: block.blockNum,
            _blockTime: block.blockTime,
        };

        const handlers = {
            cyber: {
                newaccount: this._newAccountAction,
            },
            'cyber.domain': {
                newusername: this._newUsernameAction,
            },
            'cyber.token': {
                EVENTS: {
                    balance: this._updateBalanceEvent,
                },
            },
        };

        this._extractTransactionStorables(transactions, handlers, storage, stats);

        return {
            counters: {
                current: stats,
                total: this._mergeStats(parentBlock ? parentBlock.counters.total : null, stats),
            },
            storage,
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
            const actionActors = {};

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
                    actionActors[actor] = true;

                    blockIndexes.actors[actor] = true;
                    blockIndexes.actorsPerm[actorPerm] = true;
                }
            }

            if (args) {
                const actionAccounts = await this._extractAccounts({
                    code,
                    action,
                    args,
                });

                delete actionAccounts['']; // sometimes used as "nothing", e.g. in parent_message.author

                // In most cases `accounts` contains whole `actors` (especially if accountPath autogenerated).
                // This makes "mentions" filter same as "all" = useless, so exclude `actors` from `accounts`.
                for (const key of Object.keys(actionActors)) {
                    delete actionAccounts[key];
                }

                Object.assign(accounts, actionAccounts);

                if (actionObject.data === '') {
                    actionObject.data = undefined;
                }
                actionObject.accounts = Object.keys(actionAccounts);
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
        await TokenBalanceModel.deleteMany(condition);

        this._accountPathsCache.deleteNewerThanBlockNum(baseBlockNum);
    }

    async _extractAccounts({ code, action, args }) {
        const accounts = {};

        if (this._accountPathsCache.extractIndirectAccounts({ code, action, args, accounts })) {
            return accounts;
        }

        const paths = (await this._accountPathsCache.get(code, action)) || [];

        for (const path of paths) {
            const accountsList = extractByPath(args, path.split('/'));

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

        if (hexAbi.length) {
            const buffer = Buffer.from(hexAbi, 'hex');
            const abi = CyberwayClient.get().rawAbiToJson(buffer);

            for (const { name, type } of abi.actions) {
                const struct = abi.structs.find(({ name }) => name === type);

                if (struct.base) {
                    Logger.error('Unsupported case, structure with base:', struct);
                }

                // TODO: field type can contain name alias or struct containing name inside (recursive)
                entries.push({
                    account,
                    blockNum,
                    action: name,
                    accountPaths: struct.fields
                        .filter(field => field.type === 'name')
                        .map(field => field.name),
                });
            }
        }

        return {
            account,
            entries,
        };
    }

    async _saveIrrStorage(storage, block) {
        const { proposals } = storage;
        await this._saveProposals(Object.values(proposals), block.blockNum);
    }

    async _saveProposals(proposals, blockNum) {
        if (!proposals.length) return;

        const have = await Promise.all(
            proposals.map(({ proposer, name }) => {
                const query = { proposer, name, finalStatus: null };
                return ProposalModel.findOne(query, {}, { lean: true });
            })
        );

        await Promise.all(
            proposals.map((proposal, i) => {
                const { proposer, name, approvals } = proposal;
                const found = have[i];
                if (found) {
                    if (approvals) {
                        const current = found.approvals;
                        for (const a of approvals) {
                            const idx = current.findIndex(x => x.level === a.level);
                            if (idx >= 0) {
                                current[idx] = a;
                            } else {
                                current.push(a);
                                this._log({
                                    message: `missing ${a.level} approval in ${proposer}/${name}`,
                                    blockNum,
                                });
                            }
                        }
                        proposal.approvals = current;
                    }
                }
                const query = { proposer, name, finalStatus: null };
                return ProposalModel.findOneAndUpdate(query, proposal, { upsert: true });
            })
        );
    }

    async _saveStorage(storage, block) {
        const { newAccounts, balances } = storage;
        await Promise.all([
            this._saveNewAccounts(newAccounts, block),
            this._saveBalanceUpdates(balances, block.blockNum),
        ]);
    }

    async _saveNewAccounts(accounts, block) {
        await Promise.all(
            accounts.map(async ({ id, keys, golosId, creator }) => {
                const accountModel = new AccountModel({
                    blockId: block.id,
                    blockNum: block.blockNum,
                    blockTime: block.blockTime,
                    registrationTime: block.blockTime,
                    id,
                    keys,
                    golosId,
                    creator,
                });

                return saveModelIgnoringDups(accountModel);
            })
        );
    }

    async _saveBalanceUpdates(balances, blockNum) {
        if (Object.keys(balances).length === 0) {
            return;
        }

        await Promise.all(
            Object.values(balances).map(async ({ account, symbol, balance, payments }) => {
                const balanceModel = new TokenBalanceModel({
                    blockNum,
                    account,
                    symbol,
                    balance,
                    payments,
                });

                try {
                    await balanceModel.save();
                } catch (err) {
                    if (!(err.name === 'MongoError' && err.code === 11000)) {
                        throw err;
                    }
                }
            })
        );
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

    async _log({ message, blockNum }) {
        const data = { text: message, blockNum, module: 'Subscriber' };
        const log = new LogModel(data);

        Logger.warn(data);
        await log.save();
    }
}

module.exports = Subscriber;
