const core = require('gls-core-service');
const MongoDB = core.services.MongoDB;

module.exports = MongoDB.makeModel(
    'ActionVariant',
    {
        code: {
            type: String,
            required: true,
        },
        action: {
            type: String,
            required: true,
        },
        appearInBlockId: {
            type: String,
            required: true,
        },
    },
    {
        index: [
            {
                fields: {
                    code: 1,
                    action: 1,
                },
                options: {
                    unique: true,
                },
            },
            {
                fields: {
                    action: 1,
                },
            },
        ],
    }
);
