const core = require('gls-core-service');
const BasicMain = core.services.BasicMain;
const env = require('./data/env');
const Subscriber = require('./services/Subscriber');
const ServiceMetaModel = require('./models/ServiceMeta');

class Main extends BasicMain {
    constructor() {
        super(env);

        this.startMongoBeforeBoot();

        this._subscriber = new Subscriber();
        this.addNested(this._subscriber);
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
