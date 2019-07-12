const core = require('gls-core-service');
const env = process.env;

module.exports = {
    ...core.data.env,
    GLS_BLOCKCHAIN_BROADCASTER_CONNECT: env.GLS_BLOCKCHAIN_BROADCASTER_CONNECT,
};
