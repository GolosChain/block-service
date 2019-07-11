const core = require('gls-core-service');
const MongoDB = core.services.MongoDB;

module.exports = MongoDB.makeModel('ServiceMeta', {
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
