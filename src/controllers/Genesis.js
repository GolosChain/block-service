const core = require('cyberway-core-service');
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
                await this._balancesBulk.finish();
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
                owner: data.owner_keys ? makePermission(data.owner_keys) : data.owner_auth,
                active: data.active_keys ? makePermission(data.active_keys) : data.active_auth,
                posting: data.posting_keys ? makePermission(data.posting_keys) : data.posting_auth,
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
