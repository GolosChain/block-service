const BlockModel = require('../models/Block');
const TransactionModel = require('../models/Transaction');

class Blocks {
    async getBlockList({ fromBlockNum, limit }) {
        const query = {};

        if (fromBlockNum) {
            query.blockNum = {
                $lte: fromBlockNum,
            };
        }

        const blocks = await BlockModel.find(
            query,
            {
                _id: 0,
                id: 1,
                parentId: 1,
                blockNum: 1,
                blockTime: 1,
                transactionsCount: 1,
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

    async getBlockTransactions({ blockId, startTransactionId, limit }) {
        const query = {
            blockId,
        };

        if (startTransactionId) {
            query.id = {
                $gte: startTransactionId,
            };
        }

        const transactions = await TransactionModel.find(
            query,
            {
                _id: 0,
                id: 1,
                status: 1,
                stats: 1,
                actions: 1,
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
        const transaction = await TransactionModel.find(
            {
                id: transactionId,
            },
            {
                _id: 0,
                id: 1,
                status: 1,
                stats: 1,
                actions: 1,
            },
            {
                lean: true,
            }
        );

        return {
            transaction,
        };
    }
}

module.exports = Blocks;
