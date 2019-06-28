const core = require('gls-core-service');
const MongoDB = core.services.MongoDB;

module.exports = MongoDB.makeModel('ServiceMeta', {
    lastProcessedSequence: {
        type: Number,
        default: null,
    },
    lastProcessedTime: {
        type: Date,
        default: null,
    },
    irreversibleBlockNum: {
        type: Number,
        default: null,
    },
});
