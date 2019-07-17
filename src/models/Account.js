const core = require('gls-core-service');
const MongoDB = core.services.MongoDB;

module.exports = MongoDB.makeModel(
    'Account',
    {
        id: {
            type: String,
            required: true,
        },
        golosId: {
            type: String,
        },
        blockId: {
            type: String,
        },
        blockNum: {
            type: Number,
            required: true,
        },
        blockTime: {
            type: Date,
        },
        registrationTime: {
            type: Date,
        },
        keys: {
            type: Object,
            required: true,
        },
    },
    {
        index: [
            {
                fields: {
                    id: 1,
                    blockId: 1,
                },
                options: {
                    unique: true,
                },
            },
            {
                fields: {
                    blockNum: -1,
                },
            },
        ],
    }
);
