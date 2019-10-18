const core = require('cyberway-core-service');
const { metrics, BulkSaver } = core.utils;

const AccountModel = require('../models/Account');
const BalanceModel = require('../models/TokenBalance');

// this accounts are not in EE genesis, it's simpler to hardcode for now. src: https://github.com/cyberway/golos.contracts/blob/3e6b43ac70f25de8b877244881565ea3148298dc/genesis/genesis-info.json.tmpl#L52
const GENESIS_CREATED_ACCOUNTS = [
    'cyber',
    'cyber.msig',
    'cyber.domain',
    'cyber.govern',
    'cyber.stake',
    'cyber.null',
    'cyber.prods',
    'cyber.token',
    'cyber.names',
    'cyber.worker',
    'cyber.appfund',
    'cyber.core',
    'cyber.io',
    'gls',
    'gls.ctrl',
    'gls.emit',
    'gls.vesting',
    'gls.publish',
    'gls.social',
    'gls.charge',
    'gls.referral',
    'gls.memo',
    'gls.worker',
];

class GenesisContent {
    /**
     * @param {Function} onDone -- функция для остановки дальней обработки генезиса, вызывается с await.
     */
    constructor({ onDone }) {
        this._onDone = onDone;

        this._accountsBulk = new BulkSaver(AccountModel, 'accounts');
        this._balancesBulk = new BulkSaver(BalanceModel, 'balances');

        const registrationTime = Date.parse('2019-08-15T14:00:00.000Z');
        for (const account of GENESIS_CREATED_ACCOUNTS) {
            this._accountsBulk.addEntry({
                id: account,
                blockNum: 1,
                registrationTime,
                keys: {}, // keys will be obtained from state-reader #14
            });
        }
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
