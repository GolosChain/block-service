const core = require('cyberway-core-service');
const MongoDB = core.services.MongoDB;

module.exports = MongoDB.makeModel(
    'Proposal',
    {
        proposer: { type: String, required: true },
        name: { type: String, required: true },
        // hash: { type: String, required: true }, // trx is unpacked, so it's not easy to get, TODO
        blockNum: { type: Number, required: true },
        trx: { type: Object, required: true },
        expires: { type: Date },
        updateTime: { type: Date },
        approvals: [
            {
                _id: false,
                level: { type: String, required: true },
                status: { type: String }, // "approve"/"unapprove"/undefined
                time: { type: Date },
            },
        ],
        finished: {
            actor: { type: String }, // account name of executer/canceler
            status: { type: String }, // "exec"/"cancel"/undefined for active proposals
            execTrxId: { type: String },
        },
        scheduled: { type: Date }, // only set if scheduled
    },
    {
        index: [
            {
                fields: { proposer: 1, name: 1, blockNum: 1 },
            },
            {
                fields: { blockNum: -1 },
            },
        ],
    }
);
