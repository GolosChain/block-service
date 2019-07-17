const gls = require('gls-core-service');

if (process.env.GLS_API) {
    gls.utils.defaultStarter(require('./Api'));
} else {
    gls.utils.defaultStarter(require('./Main'));
}
