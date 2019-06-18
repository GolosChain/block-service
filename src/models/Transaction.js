const core = require('gls-core-service');
const MongoDB = core.services.MongoDB;

module.exports = MongoDB.makeModel(
    'Transaction',
    {
        id: {
            type: String,
            required: true,
        },
        index: {
            type: Number,
            required: true,
        },
        blockId: {
            type: String,
            required: true,
        },
        blockNum: {
            type: Number,
            required: true,
        },
        status: {
            type: String,
            required: true,
        },
        actions: [
            {
                type: Object,
            },
        ],
        actionsCount: {
            type: Number,
            required: true,
        },
        stats: {
            type: Object,
            required: true,
        },
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
                    index: 1,
                },
            },
        ],
    }
);
