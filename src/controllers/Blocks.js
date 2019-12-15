const env = require('../data/env');

const BlockModel = require('../models/Block');
const TransactionModel = require('../models/Transaction');
const AccountModel = require('../models/Account');
const ServiceMetaModel = require('../models/ServiceMeta');

const accountsProjection = {
    _id: false,
    id: true,
    golosId: true,
};

class Blocks {
    constructor({ blockUtils }) {
        let host = null;

        const match = env.GLS_BLOCKCHAIN_BROADCASTER_CONNECT.match(/@([^@:]+):\d+$/);

        if (match) {
            host = match[1];

            const parts = host.match(/^(\d+)\..*\.(\d+)$/);

            if (parts) {
                host = `${parts[1]}.*.*.${parts[2]}`;
            }
        }

        this._host = host;
        this._blockUtils = blockUtils;
    }

    async getBlockList({ fromBlockNum, limit, code, action, actor, event, nonEmpty }) {
        const query = {};

        if (fromBlockNum) {
            query.blockNum = {
                $lte: fromBlockNum,
            };
        }

        this._addFilters(query, '', { code, action, actor, event });

        if (nonEmpty) {
            query['counters.current.transactions.executed'] = { $ne: 0 };
        }

        const blocks = await BlockModel.find(
            query,
            {
                _id: 0,
                id: 1,
                parentId: 1,
                blockNum: 1,
                blockTime: 1,
                producer: 1,
                'counters.current.transactions': 1,
                'counters.current.actions': 1,
            },
            {
                sort: { blockNum: -1 },
                limit,
                lean: true,
            }
        );

        for (const block of blocks) {
            block.counters = block.counters.current;
        }

        return {
            blocks,
        };
    }

    async getBlock({ blockId, blockNum }) {
        const query = {};

        if (blockId) {
            query.id = blockId;
        } else if (blockNum) {
            query.blockNum = blockNum;
        } else {
            throw {
                code: 500,
                message: 'Invalid query',
            };
        }

        const block = await BlockModel.findOne(
            query,
            {
                _id: 0,
                id: 1,
                parentId: 1,
                blockNum: 1,
                blockTime: 1,
                producer: 1,
                'counters.current.transactions': 1,
            },
            {
                lean: true,
            }
        );

        if (!block) {
            throw {
                code: 404,
                message: 'Not found',
            };
        }

        block.counters = block.counters.current;

        return block;
    }

    async getBlockTime({ blockNums }) {
        return await this._blockUtils.getBlockTime({ blockNums, asObj: true });
    }

    async getBlockTransactions({ blockId, fromIndex, limit, code, action, actor, event }) {
        const blockNum = parseInt(blockId.substr(0, 8), 16);
        const query = {
            blockNum, // we have db index by block num, use it
            blockId,
        };

        this._addFilters(query, 'actionsIndexes.', {
            code,
            action,
            actor,
            event,
        });

        if (fromIndex) {
            query.index = {
                $gt: fromIndex,
            };
        }

        const transactions = await TransactionModel.find(
            query,
            {
                _id: false,
                id: true,
                index: true,
                status: true,
                stats: true,
                actionsCount: true,
            },
            {
                sort: { index: 1 },
                limit,
                lean: true,
            }
        );

        return {
            transactions,
        };
    }

    async getTransaction({ transactionId }) {
        const transaction = await TransactionModel.findOne(
            {
                id: transactionId,
            },
            {
                _id: false,
                id: true,
                status: true,
                stats: true,
                blockId: true,
                blockNum: true,
                blockTime: true,
                actions: true,
            },
            {
                lean: true,
            }
        );

        if (!transaction) {
            throw {
                code: 404,
                message: 'Not found',
            };
        }

        this._addActionIndexes(transaction.actions);

        return transaction;
    }

    async findEntity({ text }) {
        const blocks = [];

        if (/^\d+$/.test(text)) {
            const blockNum = parseInt(text, 10);

            const block = await BlockModel.findOne(
                { blockNum },
                { _id: 0, id: 1, blockNum: 1, blockTime: 1 },
                { lean: true }
            );

            if (block) {
                blocks.push({
                    type: 'block',
                    data: block,
                });
            }
        }

        const [items, accounts] = await Promise.all([
            this._findBlockOrTransaction(text),
            this._findAccounts(text),
        ]);

        return {
            items: blocks.concat(items).concat(accounts),
        };
    }

    async _findBlockOrTransaction(text) {
        const items = [];

        if (text.length === 64 && /^[a-f0-9]+$/.test(text)) {
            const [block, transaction] = await Promise.all([
                BlockModel.findOne(
                    { id: text },
                    { _id: false, id: true, blockNum: true, blockTime: true },
                    { lean: true }
                ),
                TransactionModel.findOne(
                    { id: text },
                    {
                        _id: false,
                        id: true,
                        status: true,
                        blockId: true,
                        blockNum: true,
                        actionsCount: true,
                    },
                    { lean: true }
                ),
            ]);

            if (block) {
                items.push({
                    type: 'block',
                    data: block,
                });
            }

            if (transaction) {
                items.push({
                    type: 'transaction',
                    data: transaction,
                });
            }
        }

        return items;
    }

    async _findAccounts(prefix) {
        const [accounts, golosAccounts] = await Promise.all([
            AccountModel.find(
                {
                    id: {
                        $regex: `^${prefix}`,
                    },
                },
                accountsProjection,
                {
                    lean: true,
                    limit: 5,
                    sort: {
                        id: 1,
                    },
                }
            ),
            AccountModel.find(
                {
                    golosId: {
                        $regex: `^${prefix}`,
                    },
                },
                accountsProjection,
                {
                    lean: true,
                    limit: 5,
                    sort: {
                        golosId: 1,
                    },
                }
            ),
        ]);

        return accounts.concat(golosAccounts).map(account => ({
            type: 'account',
            data: account,
        }));
    }

    async getBlockChainInfo() {
        const results = {
            lastBlockId: null,
            lastBlockNum: null,
            irreversibleBlockNum: null,
            totalTransactions: 0,
            blockchainHost: this._host,
        };

        const [block, meta] = await Promise.all([
            BlockModel.findOne(
                {},
                {
                    id: 1,
                    blockNum: 1,
                    'counters.total': 1,
                },
                {
                    sort: {
                        blockNum: -1,
                    },
                    lean: true,
                }
            ),
            ServiceMetaModel.findOne({}, { irreversibleBlockNum: 1 }, { lean: true }),
        ]);

        if (block) {
            results.lastBlockId = block.id;
            results.irreversibleBlockNum = meta.irreversibleBlockNum;
            results.lastBlockNum = block.blockNum;
            results.accountsCount = block.counters.total.accounts.created;
            results.transactionsCount = block.counters.total.transactions.executed;
        }

        return results;
    }

    _addFilters(query, prefix = '', { code, action, actor, event }) {
        if (code && action) {
            query[`${prefix}codeActions`] = `${code}::${action}`;
        } else if (code) {
            query[`${prefix}codes`] = code;
        } else if (action) {
            query[`${prefix}actions`] = action;
        }

        if (actor) {
            if (actor.includes('/')) {
                query[`${prefix}actorsPerm`] = actor;
            } else {
                query[`${prefix}actors`] = actor;
            }
        }

        if (event) {
            query[`${prefix}eventNames`] = event;
        }
    }

    async getAccountTransactions({
        accountId,
        type,
        code,
        action,
        actor,
        event,
        sequenceKey,
        limit,
    }) {
        const query = {};

        switch (type) {
            case 'all':
                query['$or'] = [
                    { 'actionsIndexes.accounts': accountId },
                    { 'actionsIndexes.actors': accountId },
                ];
                break;
            case 'actor':
                query['actionsIndexes.actors'] = accountId;
                break;
            case 'mention':
                query['actionsIndexes.accounts'] = accountId;
                break;
            default:
        }

        this._addFilters(query, 'actionsIndexes.', {
            code,
            action,
            actor,
            event,
        });

        if (sequenceKey) {
            query._id = {
                $lt: sequenceKey,
            };
        }

        const transactions = await TransactionModel.find(
            query,
            {
                id: true,
                status: true,
                blockId: true,
                blockNum: true,
                blockTime: true,
                actions: true,
            },
            { lean: true, limit, sort: { _id: -1 } }
        );

        for (const transaction of transactions) {
            this._addActionIndexes(transaction.actions);
        }

        let nextSequenceKey = null;

        if (transactions.length === limit) {
            const { _id } = transactions[transactions.length - 1];
            nextSequenceKey = _id;
        }

        for (const transaction of transactions) {
            delete transaction._id;
        }

        return {
            id: accountId,
            transactions,
            sequenceKey: nextSequenceKey,
        };
    }

    _addActionIndexes(actions) {
        for (let i = 0; i < actions.length; i++) {
            const action = actions[i];
            // Нумерация в экшенах идет с 1
            action.index = i + 1;
        }
    }
}

module.exports = Blocks;
