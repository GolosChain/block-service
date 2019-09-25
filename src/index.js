const core = require('cyberway-core-service');

if (process.env.GLS_API) {
    core.utils.defaultStarter(require('./Api'));
} else {
    core.utils.defaultStarter(require('./Main'));
}
