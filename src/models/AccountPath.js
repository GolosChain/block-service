const core = require('cyberway-core-service');
const MongoDB = core.services.MongoDB;

module.exports = MongoDB.makeModel(
    'AccountPath',
    {
        account: {
            type: String,
            required: true,
        },
        blockNum: {
            type: Number,
            required: true,
        },
        action: {
            type: String,
            required: true,
        },
        accountPaths: [
            {
                type: String,
                required: true,
            },
        ],
    },
    {
        index: [
            {
                fields: {
                    account: 1,
                    action: 1,
                    blockNum: -1,
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
