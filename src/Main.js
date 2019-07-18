const core = require('gls-core-service');
const BasicMain = core.services.BasicMain;
const { Logger, GenesisProcessor } = core.utils;
const env = require('./data/env');
const Subscriber = require('./services/Subscriber');
const ServiceMetaModel = require('./models/ServiceMeta');
const GenesisController = require('./controllers/Genesis');

class Main extends BasicMain {
    constructor() {
        super(env);

        this.startMongoBeforeBoot();

        this._subscriber = new Subscriber();
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

    async start() {
        await super.start();

        const meta = await this._getMeta();

        if (!meta.isGenesisApplied && !env.GLS_SKIP_GENESIS) {
            await this._processGenesis();
            return;
        }

        this.addNested(this._subscriber);
        await this._subscriber.start();
    }

    async _getMeta() {
        return await ServiceMetaModel.findOne({}, {}, { lean: true });
    }

    async _updateMeta(updates) {
        await ServiceMetaModel.updateOne(
            {},
            {
                $set: updates,
            }
        );
    }

    async _processGenesis() {
        const genesisProcessor = new GenesisProcessor({
            genesisController: new GenesisController({
                onDone: async () => {
                    Logger.log('Genesis processing done, restarting...');
                    await this._updateMeta({ isGenesisApplied: true });
                    process.exit(0);
                },
            }),
        });

        try {
            await genesisProcessor.process();
        } catch (err) {
            if (err.message !== 'STOP_PROCESSING_GENESIS') {
                throw err;
            }
        }
    }
}

module.exports = Main;
