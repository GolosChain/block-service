const core = require('gls-core-service');
const BasicMain = core.services.BasicMain;
const env = require('./data/env');
const Subscriber = require('./services/Subscriber');

class Main extends BasicMain {
    constructor() {
        super(env);

        this.startMongoBeforeBoot();

        this._subscriber = new Subscriber();
        this.addNested(this._subscriber);
    }
}

module.exports = Main;
