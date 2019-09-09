const core = require('gls-core-service');
const fetch = require('node-fetch');
const env = require('../data/env');
const BasicService = core.services.Basic;
const { Logger } = core.utils;

const REFRESH_INTERVAL = 60 * 1000;

class DataActualizer extends BasicService {
    async start() {
        this._stakeStat = null;
        this._validators = [];
        this._validatorsUpdateTime = null;
        this._producers = [];
        this._producersUpdateTime = null;
        this._usernamesCache = {};          // caches usernames in golos domain

        await this._refreshData();
        setInterval(this._refreshData.bind(this), REFRESH_INTERVAL);
    }

    getProducers() {
        return {
            producers: this._producers,
            updateTime: this._producersUpdateTime,
        };
    }

    async getUsernames(accounts) {
        let usernames = {};
        let missing = {};       // use object instead of array to avoid duplicates
        for (let acc of accounts) {
            let username = this._usernamesCache[acc];
            if (username !== undefined) {
                usernames[acc] = username;
            } else {
                missing[acc] = true;
            }
        }
        for (let acc of Object.keys(missing)) {
            const data = await this.callChainApi({
                endpoint: 'get_table_rows',
                args: {
                    code: "",
                    scope: "",
                    table: "username",
                    index: "owner",
                    limit: 1,
                    lower_bound: {"scope":"gls", "name":"", "owner":acc}
                }
            })
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
        return usernames
    }

    async getValidators() {
        return {
            items: this._validators,
            updateTime: this._validatorsUpdateTime,
            totalStaked: this._stakeStat.total_staked,
            totalVotes: this._stakeStat.total_votes,
        };
    }

    async callChainApi({endpoint, args}) {
        try {
            const response = await fetch(
                `${env.GLS_CYBERWAY_CONNECT}/v1/chain/${endpoint}`, {
                    method: 'POST',
                    body: JSON.stringify(args),
                }
            );
            const data = await response.json();
            return data;
        } catch (err) {
            Logger.error('DataActualizer api call failed:', err);
        }
    }

    async addUsernames(items, accountField) {
        if (!items.length) return;
        let accounts = [];
        items.forEach(item => {
            accounts.push(item[accountField]);
        });
        const usernames = await this.getUsernames(accounts);
        items.forEach(item => {
            item.username = usernames[item[accountField]];
        });
    }

    async _refreshData() {
        try {
            const data = await this.callChainApi({endpoint:'get_producer_schedule'});
            this._producersUpdateTime = new Date();
            let prods = data.active.producers;
            await this.addUsernames(prods, 'producer_name');
            this._producers = prods.map(producer => {
                return {
                    id: producer.producer_name,
                    signKey: producer.block_signing_key,
                    username: producer.username,
                };
            });
            Logger.log("Fetched producer:", this._producers[0]);

            const stake = await this.callChainApi({
                endpoint: 'get_table_rows',
                args: {
                    code: "",
                    scope: "",
                    table: "stake.stat",
                    index: "primary",
                }
            });
            this._stakeStat = stake.rows[0];

            const rows = await this.callChainApi({
                endpoint: 'get_table_rows',
                args: {
                    code: "",
                    scope: "",
                    table: "stake.cand",
                    index: "byvotes",
                    limit: 100,
                    lower_bound: {
                        token_code: "CYBER",
                        enabled: true,
                        votes: 0x7FFFFFFFFFFFFFFF,
                        account: ""
                    }
                }
            });
            const candidates = rows.rows;
            await this.addUsernames(candidates, 'account');
            this._validators = candidates
                .filter(man => {
                    return man.enabled && man.token_code === 'CYBER';
                })
                .map(candidate => { return {
                    account: candidate.account,
                    enabled: candidate.enabled,
                    latestPick: candidate.latest_pick,
                    signKey: candidate.signing_key,
                    votes: candidate.votes,
                    username: candidate.username,
                    percent: 100 * candidate.votes / this._stakeStat.total_votes,
                }});
            this._validatorsUpdateTime = new Date();
        } catch (err) {
            Logger.error('DataActualizer tick failed:', err);
        }
    }
}

module.exports = DataActualizer;
