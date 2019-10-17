const fetch = require('node-fetch');
const core = require('cyberway-core-service');
const BasicService = core.services.Basic;
const { Logger } = core.utils;
const env = require('../data/env');

const REFRESH_INTERVAL = 60 * 1000;
const ACCOUNTS_CACHE_EXPIRE = 2 * 60 * 1000;

class DataActualizer extends BasicService {
    setStateReader(reader) {
        this._stateReader = reader;
    }

    async start() {
        this._stakeStat = null;
        this._tokensStats = null;
        this._validators = [];
        this._validatorsUpdateTime = null;
        this._producers = [];
        this._lastRefreshTime = null;
        this._usernamesCache = {}; // username cache for golos domain
        this._grantsCache = {};

        await this._refreshData();

        setInterval(this._refreshData.bind(this), REFRESH_INTERVAL);
        setInterval(this._clearCache.bind(this), REFRESH_INTERVAL);
    }

    getProducers() {
        return {
            producers: this._producers,
            updateTime: this._lastRefreshTime,
        };
    }

    // TODO: cache negative results (accounts without usernames) to fetch them at most once/period
    async getUsernames(accounts) {
        const usernames = {};
        const missing = {}; // use object instead of array to avoid duplicates

        for (const acc of accounts) {
            let username = this._usernamesCache[acc];

            if (username !== undefined) {
                usernames[acc] = username;
            } else {
                missing[acc] = true;
            }
        }

        const toFetch = Object.keys(missing);
        if (toFetch.length && this._stateReader) {
            const { items } = await this._stateReader.getUsernames({ accounts: toFetch });
            for (const { owner, name } of items) {
                usernames[owner] = this._usernamesCache[owner] = name;
            }
        }
        return usernames;
    }

    async getInfo() {
        return await this._callChainApi({ endpoint: 'get_info' });
    }

    async getGrants({ account }) {
        const now = Date.now();
        let grants = this._grantsCache[account];

        // it's now cached, but when user changes/removes grant, it should be invalidated. TODO: resolve
        if (!grants || now - grants.updateTime > ACCOUNTS_CACHE_EXPIRE) {
            const fields = ['recipient_name', 'pct', 'share', 'break_fee', 'break_min_own_staked'];
            const { items } = await this._stateReader.getStakeGrants({ grantor: account, fields });

            await this.addUsernames(items, 'recipient');
            grants = { updateTime: new Date(now), items };
            this._grantsCache[account] = grants;
        }

        return grants;
    }

    _tokenAmount(tokenString) {
        return parseInt(tokenString.replace('.', ''));
    }

    getValidators() {
        return {
            items: this._validators,
            updateTime: this._validatorsUpdateTime,
            supply: this._tokenAmount(this._tokensStats.supply),
            ...(this._stakeStat || {}),
        };
    }

    // TODO: cache
    async getAgents({ accounts, includeShare }) {
        const shareFields = includeShare ? ['balance', 'proxied', 'own_share', 'shares_sum'] : [];
        const fields = ['account', 'proxy_level', 'fee', 'min_own_staked', ...shareFields];
        const { items } = await this._stateReader.getStakeAgents({ accounts, fields });
        return items;
    }

    async _callChainApi({ endpoint, args }) {
        const response = await fetch(`${env.GLS_CYBERWAY_CONNECT}/v1/chain/${endpoint}`, {
            method: 'POST',
            body: JSON.stringify(args),
        });

        return await response.json();
    }

    async addUsernames(items, accountField) {
        if (!items.length) {
            return;
        }

        const accounts = items.map(item => item[accountField]);
        const usernames = await this.getUsernames(accounts);

        for (const item of items) {
            item.username = usernames[item[accountField]];
        }
    }

    async _refreshProducersSchedule() {
        const data = await this._callChainApi({
            endpoint: 'get_producer_schedule',
        });

        const prods = data.active.producers;

        await this.addUsernames(prods, 'producer_name');

        this._producers = prods.map(producer => ({
            id: producer.producer_name,
            signKey: producer.block_signing_key,
            username: producer.username,
        }));
    }

    async _refreshStakeStats() {
        const fields = ['total_staked', 'total_votes'];

        this._stakeStat = await this._stateReader.getStakeStat({ fields });
    }

    async _refreshTokenStats() {
        const { items } = await this._stateReader.getTokens();

        this._tokensStats = items.find(({ symbol }) => symbol === 'CYBER');
    }

    async _refreshStakeCandidates() {
        const filter = { enabled: true };
        const { items } = await this._stateReader.getStakeCandidates({ filter, limit: 100 });

        await this.addUsernames(items, 'account');
        this._validators = items;
        this._validatorsUpdateTime = new Date();
    }

    async _refreshData() {
        try {
            await Promise.all([
                // this._refreshProducersSchedule(),
                this._refreshStakeCandidates(),
                this._refreshStakeStats(),
                this._refreshTokenStats(),
            ]);
            this._lastRefreshTime = new Date();
        } catch (err) {
            Logger.error('DataActualizer tick failed:', err);
        }
    }

    _clearCache() {
        const now = Date.now();

        for (const [accountId, grants] of Object.entries(this._grantsCache)) {
            if (now - grants.updateTime > ACCOUNTS_CACHE_EXPIRE) {
                delete this._grantsCache[accountId];
            }
        }
    }
}

module.exports = DataActualizer;
