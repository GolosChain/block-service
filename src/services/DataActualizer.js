const fetch = require('node-fetch');
const core = require('gls-core-service');
const BasicService = core.services.Basic;
const { Logger } = core.utils;
const env = require('../data/env');

const REFRESH_INTERVAL = 60 * 1000;
const ACCOUNTS_CACHE_EXPIRE = 2 * 60 * 1000;

class DataActualizer extends BasicService {
    async start() {
        this._stakeStat = null;
        this._validators = [];
        this._validatorsUpdateTime = null;
        this._producers = [];
        this._producersUpdateTime = null;
        this._usernamesCache = {}; // username cache for golos domain
        this._grantsCache = {};

        await this._refreshData();

        setInterval(this._refreshData.bind(this), REFRESH_INTERVAL);
        setInterval(this._clearCache.bind(this), REFRESH_INTERVAL);
    }

    getProducers() {
        return {
            producers: this._producers,
            updateTime: this._producersUpdateTime,
        };
    }

    async getUsernames(accounts) {
        let usernames = {};
        let missing = {}; // use object instead of array to avoid duplicates

        for (const acc of accounts) {
            let username = this._usernamesCache[acc];

            if (username !== undefined) {
                usernames[acc] = username;
            } else {
                missing[acc] = true;
            }
        }

        for (const acc of Object.keys(missing)) {
            const data = await this._callChainApi({
                endpoint: 'get_table_rows',
                args: {
                    code: '',
                    scope: '',
                    table: 'username',
                    index: 'owner',
                    limit: 1,
                    lower_bound: { scope: 'gls', name: '', owner: acc },
                },
            });

            let ok = data && data.rows && data.rows.length === 1;

            if (ok) {
                const row = data.rows[0];
                ok = row.scope === 'gls' && row.owner === acc;
                if (ok) {
                    usernames[acc] = this._usernamesCache[acc] = row.name;
                }
            }

            if (!ok) {
                Logger.error('Failed to fetch username of', acc);
            }
        }
        return usernames;
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
                    .filter(
                        grant =>
                            grant.token_code === 'CYBER' &&
                            grant.grantor_name === account &&
                            grant.share > 0
                    )
                    .map(({ recipient_name }) => ({
                        accountId: recipient_name,
                    })),
            };

            await this.addUsernames(grants.items, 'accountId');

            this._grantsCache[account] = grants;
        }

        return grants;
    }

    async getValidators() {
        return {
            items: this._validators,
            updateTime: this._validatorsUpdateTime,
            totalStaked: this._stakeStat.total_staked,
            totalVotes: this._stakeStat.total_votes,
        };
    }

    async _callChainApi({ endpoint, args }) {
        const response = await fetch(
            `${env.GLS_CYBERWAY_CONNECT}/v1/chain/${endpoint}`,
            {
                method: 'POST',
                body: JSON.stringify(args),
            }
        );

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

    async _refreshData() {
        try {
            const data = await this._callChainApi({
                endpoint: 'get_producer_schedule',
            });

            this._producersUpdateTime = new Date();
            const prods = data.active.producers;

            await this.addUsernames(prods, 'producer_name');

            this._producers = prods.map(producer => ({
                id: producer.producer_name,
                signKey: producer.block_signing_key,
                username: producer.username,
            }));

            Logger.log('Fetched producer:', this._producers[0]);

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
                .filter(
                    candidate =>
                        candidate.enabled && candidate.token_code === 'CYBER'
                )
                .map(candidate => ({
                    account: candidate.account,
                    enabled: candidate.enabled,
                    latestPick: candidate.latest_pick,
                    signKey: candidate.signing_key,
                    votes: candidate.votes,
                    username: candidate.username,
                    percent:
                        (100 * candidate.votes) / this._stakeStat.total_votes,
                }));

            this._validatorsUpdateTime = new Date();
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
