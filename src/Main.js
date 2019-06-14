const core = require('gls-core-service');
const BasicMain = core.services.BasicMain;
const env = require('./data/env');
const Blocks = require('./controllers/Blocks');
const Subscriber = require('./services/Subscriber');
const Connector = require('./services/Connector');

class Main extends BasicMain {
    constructor() {
        super(env);

        this.startMongoBeforeBoot();

        this._blocks = new Blocks();

        this._subscriber = new Subscriber();
        this._connector = new Connector({ blocks: this._blocks });

        this.addNested(this._subscriber, this._connector);
    }
}

module.exports = Main;
