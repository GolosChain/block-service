const core = require('cyberway-core-service');
const MongoDB = core.services.MongoDB;

// TODO: inherit from "undoable model"
module.exports = MongoDB.makeModel(
    'StakeAgent',
    {
        account: {
            type: String,
            required: true,
        },
        symbol: {
            type: String,
            required: true,
        },
        fee: {
            type: Number,
        },
        proxyLevel: {
            type: Number,
        },
        minStake: {
            type: Number,
        },
        blockNum: {
            type: Number,
            required: true,
        },
    },
    {
        index: [
            {
                fields: {
                    account: 1,
                    symbol: 1,
                    blockNum: -1,
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
