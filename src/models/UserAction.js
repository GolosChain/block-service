const core = require('gls-core-service');
const MongoDB = core.services.MongoDB;

module.exports = MongoDB.makeModel(
    'UserAction',
    {
        userId: {
            type: String,
            required: true,
        },
        blockId: {
            type: String,
            required: true,
        },
        transactionId: {
            type: String,
            required: true,
        },
        actionIndex: {
            type: Number,
            required: true,
        },
    },
    {
        index: [
            {
                fields: {
                    userId: 1,
                },
            },
        ],
    }
);
