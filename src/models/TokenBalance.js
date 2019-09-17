const core = require('gls-core-service');
const MongoDB = core.services.MongoDB;

// TODO: there are fields and indexes common for all revertable (on fork) models,
// it's good to have some inheritance or so to remove duplicating code
// TODO: implement removal of old records: we don't need whole history for such objects as balance
module.exports = MongoDB.makeModel(
    'TokenBalance',
    {
        account: {
            type: String,
            required: true,
        },
        symbol: {
            type: String, // should simplify fetching unique balances
            required: true,
        },
        balance: {
            type: String,
            required: true,
        },
        payments: {
            type: String,
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
                    unique: true, // there can be several changes in one block, overwrite with last one
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
