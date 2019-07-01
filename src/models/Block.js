const core = require('gls-core-service');
const MongoDB = core.services.MongoDB;

module.exports = MongoDB.makeModel(
    'Block',
    {
        id: {
            type: String,
            required: true,
        },
        parentId: {
            type: String,
            required: true,
        },
        blockNum: {
            type: Number,
            required: true,
        },
        blockTime: {
            type: Date,
            required: true,
        },
        transactionIds: [
            {
                type: String,
            },
        ],
        counters: {
            accounts: {
                type: Object,
                required: true,
            },
            accountsTotal: {
                type: Object,
                required: true,
            },
            transactions: {
                type: Object,
                required: true,
            },
            transactionsTotal: {
                type: Object,
                required: true,
            },
        },
        codes: [
            {
                type: String,
            },
        ],
        actions: [
            {
                type: String,
            },
        ],
        codeActions: [
            {
                type: String,
            },
        ],
    },
    {
        index: [
            {
                fields: {
                    id: 1,
                },
                options: {
                    unique: true,
                },
            },
            {
                fields: {
                    blockNum: 1,
                },
            },
            {
                fields: {
                    codes: 1,
                },
            },
            {
                fields: {
                    actions: 1,
                },
            },
            {
                fields: {
                    codeActions: 1,
                },
            },
        ],
    }
);
