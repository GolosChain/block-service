const core = require('gls-core-service');
const { metrics, BulkSaver } = core.utils;

const AccountModel = require('../models/Account');
const BalanceModel = require('../models/TokenBalance');

class GenesisContent {
    /**
     * @param {Function} onDone -- функция для остановки дальней обработки генезиса, вызывается с await.
     */
    constructor({ onDone }) {
        this._onDone = onDone;

        this._accountsBulk = new BulkSaver(AccountModel, 'accounts');
        this._balancesBulk = new BulkSaver(BalanceModel, 'balances');
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
        const { owner: account, name, reputation, created, balance, balance_in_sys } = data;

        let registrationTime = null;

        if (created !== '1970-01-01T00:00:00.000') {
            registrationTime = new Date(created + 'Z');
        }

        // TODO: fix EE genesis to contain complete key data https://github.com/cyberway/cyberway/issues/1120
        const makePermission = keys => {
            return {
                threshold: 1, // will be wrong for owner with recovery
                keys,
                accounts: [],
                waits: [],
            };
        };

        this._accountsBulk.addEntry({
            id: account,
            golosId: name,
            blockNum: 1,
            blockTime: null,
            blockId: null,
            reputation,
            registrationTime,
            keys: {
                owner: makePermission(data.owner_keys),
                active: makePermission(data.active_keys),
                posting: makePermission(data.posting_keys),
            },
        });
        this._balancesBulk.addEntry({
            account,
            symbol: 'GOLOS',
            balance: balance,
            blockNum: 1,
        });
        this._balancesBulk.addEntry({
            account,
            symbol: 'CYBER',
            balance: balance_in_sys,
            blockNum: 1,
        });

        metrics.inc('genesis_type_account_processed');
    }
}

module.exports = GenesisContent;
