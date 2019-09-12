const core = require('gls-core-service');
const BasicMain = core.services.BasicMain;
const env = require('./data/env');
const Blocks = require('./controllers/Blocks');
const Graphs = require('./controllers/Graphs');
const Accounts = require('./controllers/Accounts');
const Chain = require('./controllers/Chain');
const DataActualizer = require('./services/DataActualizer');
const Connector = require('./services/Connector');
const ServiceMetaModel = require('./models/ServiceMeta');

class ApiMain extends BasicMain {
    constructor() {
        super(env);

        this.startMongoBeforeBoot();

        this._actualizer = new DataActualizer();

        this.addNested(this._actualizer);

        this._blocks = new Blocks();
        this._graphs = new Graphs();
        this._accounts = new Accounts({
            dataActualizer: this._actualizer,
        });
        this._chain = new Chain({
            dataActualizer: this._actualizer,
        });

        this._connector = new Connector({
            blocks: this._blocks,
            graphs: this._graphs,
            accounts: this._accounts,
            chain: this._chain,
        });

        this.addNested(this._connector);
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

module.exports = ApiMain;
