const core = require('gls-core-service');
const { metrics, BulkSaver } = core.utils;

const AccountModel = require('../models/Account');

class GenesisContent {
    /**
     * @param {Function} onDone -- функция для остановки дальней обработки генезиса, вызывается с await.
     */
    constructor({ onDone }) {
        this._onDone = onDone;

        this._accountsBulk = new BulkSaver(AccountModel, 'accounts');
    }

    async handle(type, data) {
        switch (type) {
            case 'account':
                this._handleAccount(data);
                return true;
            default:
                // Do nothing
                return false;
        }
    }

    getQueueLength() {
        return this._accountsBulk.getQueueLength();
    }

    async typeEnd(type) {
        switch (type) {
            case 'account':
                await this._accountsBulk.finish();
                await this._onDone();
                break;
            default:
            // Do nothing
        }
    }

    async finish() {}

    _handleAccount(data) {
        const { owner: userId, name, created } = data;

        let registrationTime = null;

        if (created !== '1970-01-01T00:00:00.000') {
            registrationTime = new Date(created + 'Z');
        }

        this._accountsBulk.addEntry({
            id: userId,
            golosId: name,
            blockNum: 1,
            blockTime: null,
            blockId: null,
            registrationTime,
            keys: {},
        });

        metrics.inc('genesis_type_account_processed');
    }
}

module.exports = GenesisContent;
