const core = require('cyberway-core-service');
const MongoDB = core.services.MongoDB;

module.exports = MongoDB.makeModel('ServiceMeta', {
    isGenesisApplied: {
        type: Boolean,
        default: false,
    },
    lastProcessedBlockNum: {
        type: Number,
        default: null,
    },
    lastProcessedSequence: {
        type: Number,
        default: null,
    },
    irreversibleBlockNum: {
        type: Number,
        default: null,
    },
});
