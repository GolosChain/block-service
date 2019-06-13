const core = require('gls-core-service');
const BasicMain = core.services.BasicMain;
const env = require('./data/env');

class Main extends BasicMain {
    constructor() {
        super(env);
    }

    async boot() {
        //
    }

    async start() {
        console.log('started');
    }

    async stop() {
        //
    }
}

module.exports = Main;
