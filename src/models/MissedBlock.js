const core = require('cyberway-core-service');
const MongoDB = core.services.MongoDB;

module.exports = MongoDB.makeModel(
    'MissedBlock',
    {
        blockTime: {
            type: Date,
            required: true,
        },
        blockNum: {
            type: Number,
            required: true,
        },
        producer: {
            type: String,
            required: true,
        },
    },
    {
        index: [
            {
                fields: {
                    blockTime: 1,
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
                    producer: 1,
                },
            },
        ],
    }
);
