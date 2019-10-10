const core = require('cyberway-core-service');
const env = process.env;

module.exports = {
    ...core.data.env,
    GLS_BLOCKCHAIN_BROADCASTER_CONNECT: env.GLS_BLOCKCHAIN_BROADCASTER_CONNECT,
    GLS_SKIP_GENESIS: Boolean(env.GLS_SKIP_GENESIS) && env.GLS_SKIP_GENESIS !== 'false',
    CBW_STATE_READER_CONNECT: env.CBW_STATE_READER_CONNECT,
};
