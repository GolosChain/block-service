const core = require('cyberway-core-service');
const MongoDB = core.services.MongoDB;

module.exports = MongoDB.makeModel(
    'Transaction',
    {
        id: {
            type: String,
            required: true,
        },
        index: {
            type: Number,
            required: true,
        },
        blockId: {
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
        status: {
            type: String,
            required: true,
        },
        actions: [
            {
                type: Object,
            },
        ],
        actionsCount: {
            type: Number,
            required: true,
        },
        stats: {
            type: Object,
            required: true,
        },
        actionsIndexes: {
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
            accounts: [
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
                    blockNum: -1,
                    index: 1,
                },
            },
            {
                fields: {
                    'actionsIndexes.codes': 1,
                },
            },
            {
                fields: {
                    'actionsIndexes.actions': 1,
                },
            },
            {
                fields: {
                    'actionsIndexes.codeActions': 1,
                },
            },
            {
                fields: {
                    'actionsIndexes.actors': 1,
                },
            },
            {
                fields: {
                    'actionsIndexes.actorsPerm': 1,
                },
            },
            {
                fields: {
                    'actionsIndexes.accounts': 1,
                },
            },
            {
                fields: {
                    'actionsIndexes.eventNames': 1,
                },
            },
        ],
    }
);
