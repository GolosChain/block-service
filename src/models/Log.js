const core = require('cyberway-core-service');
const MongoDB = core.services.MongoDB;

module.exports = MongoDB.makeModel(
    'Log',
    {
        blockNum: {
            type: Number,
            required: true,
        },
        module: {
            type: String,
        },
        text: {
            type: String,
            required: true,
        },
    },
    {
        index: [
            {
                fields: {
                    blockNum: 1,
                },
            },
        ],
    }
);
