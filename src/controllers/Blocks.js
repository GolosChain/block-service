const env = require('../data/env');

const BlockModel = require('../models/Block');
const TransactionModel = require('../models/Transaction');

class Blocks {
    async getBlockList({ fromBlockNum, limit, code, action }) {
        const query = {};

        if (fromBlockNum) {
            query.blockNum = {
                $lte: fromBlockNum,
            };
        }

        if (code && action) {
            query.codeActions = `${code}::${action}`;
        } else if (code) {
            query.codes = code;
        } else if (action) {
            query.actions = action;
        }

        const blocks = await BlockModel.find(
            query,
            {
                _id: 0,
                id: 1,
                parentId: 1,
                blockNum: 1,
                blockTime: 1,
                counters: 1,
            },
            {
                sort: { blockNum: -1 },
                limit,
                lean: true,
            }
        );

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
                counters: 1,
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

        return block;
    }

    async getBlockTransactions({
        blockId,
        status,
        fromIndex,
        limit,
        code,
        action,
    }) {
        const query = {
            blockId,
        };

        if (code && action) {
            query.codeActions = `${code}::${action}`;
        } else if (code) {
            query.codes = code;
        } else if (action) {
            query.actions = action;
        }

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

    async getTransaction({ transactionId, code, action }) {
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

        for (let i = 0; i < transaction.actions.length; i++) {
            // Нумерация в экшинах идет с 1
            transaction.actions[i].index = i + 1;
        }

        if (code || action) {
            transaction.actions = transaction.actions.filter(
                actionInfo =>
                    (!code || actionInfo.code === code) &&
                    (!action || actionInfo.action === action)
            );
        }

        const block = await BlockModel.findOne(
            {
                id: transaction.blockId,
            },
            {
                _id: 0,
                id: 1,
                blockNum: 1,
                blockTime: 1,
            }
        );

        return {
            ...transaction,
            blockId: block.id,
            blockNum: block.blockNum,
            blockTime: block.blockTime,
        };
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

        return {
            blockchainHost: host,
        };
    }
}

module.exports = Blocks;
