const core = require('gls-core-service');
const BasicMain = core.services.BasicMain;
const env = require('./data/env');
const Blocks = require('./controllers/Blocks');
const Graphs = require('./controllers/Graphs');
const Subscriber = require('./services/Subscriber');
const Connector = require('./services/Connector');
const ServiceMetaModel = require('./models/ServiceMeta');

class Main extends BasicMain {
    constructor() {
        super(env);

        this.startMongoBeforeBoot();

        this._blocks = new Blocks();
        this._graphs = new Graphs();

        this._subscriber = new Subscriber();

        this._connector = new Connector({
            blocks: this._blocks,
            graphs: this._graphs,
        });

        this.addNested(this._subscriber, this._connector);
    }

    async boot() {
        const meta = await ServiceMetaModel.findOne(
            {},
            { _id: 1 },
            { lean: true }
        );

        if (!meta) {
            const model = new ServiceMetaModel({});
            await model.save();
        }
    }
}

module.exports = Main;
