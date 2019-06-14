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
        ],
    }
);
