const core = require('cyberway-core-service');
const MongoDB = core.services.MongoDB;

// Accumulate different values on per-account base.
// It's too slow to calculate buckets with dynamic ranges, they can be used only for short time
// periods (week or less). For months and total we use buckets fith fixed boundaries.
module.exports = MongoDB.makeModel(
    'AccountBucket',
    {
        bucket: {
            type: String,
            required: true,
        },
        account: {
            type: String,
            required: true,
        },
        blocksCount: {
            type: Number,
            required: true,
            default: 0,
        },
        missesCount: {
            type: Number,
            required: true,
            default: 0,
        },
    },
    {
        index: [
            {
                fields: {
                    bucket: 1,
                    account: 1,
                },
                options: {
                    unique: true,
                },
            },
            {
                fields: {
                    account: 1,
                    bucket: 1,
                },
            },
            {
                fields: {
                    bucket: 1,
                },
            },
        ],
    }
);
