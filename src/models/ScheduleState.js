const core = require('cyberway-core-service');
const MongoDB = core.services.MongoDB;

module.exports = MongoDB.makeModel('ScheduleState', {
    queue: {
        type: [String],
        default: null,
    },
    schedule: [
        {
            type: String,
        },
    ],
    blockNum: {
        type: Number,
        default: 1,
    },
    blockTime: {
        type: Date,
        default: null,
    },
    mustSync: {
        type: Boolean,
        default: true,
    },
    syncState: {
        queue: [
            {
                type: String,
            },
        ],
        missed: {
            type: Number,
        },
        blockNum: {
            type: Number,
        },
        prevTime: {
            type: Date,
        },
    },
});
