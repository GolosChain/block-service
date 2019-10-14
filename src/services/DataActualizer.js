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

        if (!grants || now - grants.updateTime > ACCOUNTS_CACHE_EXPIRE) {
            const data = await this._callChainApi({
                endpoint: 'get_table_rows',
                args: {
                    code: '',
                    scope: '',
                    table: 'stake.grant',
                    index: 'bykey',
                    limit: 30,
                    lower_bound: {
                        token_code: 'CYBER',
                        grantor_name: account,
                        recipient_name: '',
                    },
                    upper_bound: {
                        token_code: 'CYBER',
                        grantor_name: account,
                        recipient_name: 'zzzzzzzzzzzz',
                    },
                },
            });

            grants = {
                updateTime: new Date(now),
                items: data.rows
                    .filter(grant => grant.token_code === 'CYBER' && grant.grantor_name === account)
                    .map(({ recipient_name, pct, share, break_fee, break_min_own_staked }) => ({
                        accountId: recipient_name,
                        pct,
                        share,
                        breakFee: break_fee,
                        breakMinStaked: break_min_own_staked,
                    })),
            };

            await this.addUsernames(grants.items, 'accountId');

            this._grantsCache[account] = grants;
        }

        return grants;
    }

    _tokenAmount(tokenString) {
        return parseInt(tokenString.split(' ')[0].replace('.', ''));
    }

    getValidators() {
        return {
            items: this._validators,
            updateTime: this._validatorsUpdateTime,
            supply: this._tokenAmount(this._tokensStats.supply),
            totalStaked: this._stakeStat.total_staked,
            totalVotes: this._stakeStat.total_votes,
        };
    }

    _getValidTableRow({ data, filter, strictOneRow }) {
        const rows = this._filterTableRows({ data, filter });
        return rows && rows.length && (!strictOneRow || rows.length == 1) ? rows[0] : null;
    }

    _filterTableRows({ data, filter }) {
        let rows = null;

        if (data && Array.isArray(data.rows)) {
            rows = data.rows.filter(row => {
                for (const [key, value] of Object.entries(filter)) {
                    if (row[key] !== value) {
                        return false;
                    }
                }
                return true;
            });
        } else {
            throw new Error('Unexpected response of get_table_rows');
        }

        return rows;
    }

    async getAgent(account) {
        const data = await this._callChainApi({
            endpoint: 'get_table_rows',
            args: {
                code: '',
                scope: '',
                table: 'stake.agent',
                index: 'bykey',
                limit: 1,
                lower_bound: {
                    token_code: 'CYBER',
                    account,
                },
            },
        });

        const agent = this._getValidTableRow({ data, filter: { account, token_code: 'CYBER' } });

        if (agent) {
            return {
                account,
                symbol: agent.token_code,
                fee: agent.fee,
                proxyLevel: agent.proxy_level,
                minStake: agent.min_own_staked,
            };
        }

        return null;
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
        const stake = await this._callChainApi({
            endpoint: 'get_table_rows',
            args: {
                code: '',
                scope: '',
                table: 'stake.stat',
                index: 'primary',
            },
        });

        this._stakeStat = stake.rows[0];
    }

    async _refreshTokenStats() {
        const stats = await this._callChainApi({
            endpoint: 'get_table_rows',
            args: {
                code: 'cyber.token',
                scope: 'CYBER',
                table: 'stat',
                index: 'primary',
            },
        });

        this._tokensStats = stats.rows[0];
    }

    async _refreshStakeCandidates() {
        const rows = await this._callChainApi({
            endpoint: 'get_table_rows',
            args: {
                code: '',
                scope: '',
                table: 'stake.cand',
                index: 'byvotes',
                limit: 100,
                lower_bound: {
                    token_code: 'CYBER',
                    enabled: true,
                    votes: 0x7fffffffffffffff,
                    account: '',
                },
            },
        });

        const candidates = rows.rows;

        await this.addUsernames(candidates, 'account');

        this._validators = candidates
            .filter(candidate => candidate.enabled && candidate.token_code === 'CYBER')
            .map(candidate => ({
                account: candidate.account,
                enabled: candidate.enabled,
                latestPick: candidate.latest_pick + 'Z',
                signKey: candidate.signing_key,
                votes: candidate.votes,
                username: candidate.username,
                percent: (100 * candidate.votes) / this._stakeStat.total_votes,
            }));

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
