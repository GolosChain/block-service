const core = require('cyberway-core-service');
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
        producer: {
            type: String,
            required: true,
        },
        schedule: [{ type: String, required: true }],
        nextSchedule: {
            type: [String],
            default: undefined,
        },
        transactionIds: [
            {
                type: String,
            },
        ],
        counters: {
            current: {
                type: Object,
                required: true,
            },
            total: {
                type: Object,
                required: true,
            },
        },
        codes: [
            {
                type: String,
            },
        ],
        actions: [
            {
                type: String,
            },
        ],
        codeActions: [
            {
                type: String,
            },
        ],
        actors: [
            {
                type: String,
            },
        ],
        actorsPerm: [
            {
                type: String,
            },
        ],
        eventNames: [
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
            {
                fields: {
                    codes: 1,
                },
            },
            {
                fields: {
                    actions: 1,
                },
            },
            {
                fields: {
                    codeActions: 1,
                },
            },
            {
                fields: {
                    actors: 1,
                },
            },
            {
                fields: {
                    actorsPerm: 1,
                },
            },
            {
                fields: {
                    eventNames: 1,
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
