const core = require('gls-core-service');
const MongoDB = core.services.MongoDB;

module.exports = MongoDB.makeModel('ServiceMeta', {
    lastProcessedSequence: {
        type: Number,
        required: true,
    },
    lastProcessedTime: {
        type: Date,
        required: true,
    },
});
