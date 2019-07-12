const env = require('../data/env');

const BlockModel = require('../models/Block');
const TransactionModel = require('../models/Transaction');
const ServiceMetaModel = require('../models/ServiceMeta');

class Blocks {
    constructor() {
        let host = null;

        const match = env.GLS_BLOCKCHAIN_BROADCASTER_CONNECT.match(
            /@([^@:]+):\d+$/
        );

        if (match) {
            host = match[1];

            const parts = host.match(/^(\d+)\..*\.(\d+)$/);

            if (parts) {
                host = `${parts[1]}.*.*.${parts[2]}`;
            }
        }

        this._host = host;
    }

    async getBlockList({
        fromBlockNum,
        limit,
        code,
        action,
        actor,
        event,
        nonEmpty,
    }) {
        const query = {};

        if (fromBlockNum) {
            query.blockNum = {
                $lte: fromBlockNum,
            };
        }

        this._addFilters(query, '', { code, action, actor, event });

        if (nonEmpty) {
            query['counters.total.transactions'] = { $ne: 0 };
        }

        const blocks = await BlockModel.find(
            query,
            {
                _id: 0,
                id: 1,
                parentId: 1,
                blockNum: 1,
                blockTime: 1,
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

    async getBlock({ blockId }) {
        const block = await BlockModel.findOne(
            {
                id: blockId,
            },
            {
                _id: 0,
                id: 1,
                parentId: 1,
                blockNum: 1,
                blockTime: 1,
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

    async getBlockTransactions({
        blockId,
        status,
        fromIndex,
        limit,
        code,
        action,
        actor,
        event,
    }) {
        const query = {
            blockId,
        };

        this._addFilters(query, 'actionsIndexes.', {
            code,
            action,
            actor,
            event,
        });

        if (status && status !== 'all') {
            query.status = status;
        }

        if (fromIndex) {
            query.index = {
                $gt: fromIndex,
            };
        }

        const transactions = await TransactionModel.find(
            query,
            {
                _id: 0,
                id: 1,
                index: 1,
                status: 1,
                stats: 1,
            },
            {
                sort: {
                    index: 1,
                },
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
                _id: 0,
                id: 1,
                status: 1,
                stats: 1,
                blockId: 1,
                actions: 1,
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
        if (/^\d+$/.test(text)) {
            const blockNum = parseInt(text, 10);

            const block = await BlockModel.findOne(
                { blockNum },
                { _id: 0, id: 1, blockNum: 1, blockTime: 1 },
                { lean: true }
            );

            if (block) {
                return {
                    type: 'block',
                    data: block,
                };
            }
        }

        if (text.length === 64 && /^[a-f0-9]+$/.test(text)) {
            const [block, transaction] = await Promise.all([
                BlockModel.findOne(
                    { id: text },
                    { _id: 0, id: 1, blockNum: 1, blockTime: 1 },
                    { lean: true }
                ),
                TransactionModel.findOne(
                    { id: text },
                    {
                        _id: 0,
                        id: 1,
                        status: 1,
                        blockId: 1,
                        blockNum: 1,
                        actionsCount: 1,
                    },
                    { lean: true }
                ),
            ]);

            if (block) {
                return {
                    type: 'block',
                    data: block,
                };
            }

            if (transaction) {
                return {
                    type: 'transaction',
                    data: transaction,
                };
            }
        }

        return {
            type: null,
            data: null,
        };
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
            ServiceMetaModel.findOne(
                {},
                { irreversibleBlockNum: 1 },
                { lean: true }
            ),
        ]);

        if (block) {
            results.lastBlockId = block.id;
            results.irreversibleBlockNum = meta.irreversibleBlockNum;
            results.lastBlockNum = block.blockNum;
            results.accountsCount = block.counters.total.accounts.created;
            results.transactionsCount =
                block.counters.total.transactions.executed;
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
        const query = {
            status: 'executed',
        };

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
