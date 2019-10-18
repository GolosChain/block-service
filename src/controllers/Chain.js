const Schedule = require('./Schedule');
const core = require('cyberway-core-service');
const { Logger } = core.utils;

class Chain {
    constructor({ dataActualizer }) {
        this._dataActualizer = dataActualizer;
    }

    // can't set it in constructor because of circular dependence
    setStateReader(reader) {
        this._stateReader = reader;
    }

    async getProducers() {
        const { producers, updateTime } = this._dataActualizer.getProducers();

        return {
            items: producers,
            updateTime: updateTime,
        };
    }

    async getInfo() {
        return await this._dataActualizer.getInfo();
    }

    async getValidators() {
        const validators = await this._dataActualizer.getValidators();
        const { items } = validators;

        if (items.length) {
            const accounts = items.map(({ account }) => account);
            const now = new Date();
            const weekAgo = new Date(now.getTime() - 1000 * 3600 * 24 * 7);
            const query = {
                producers: accounts,
                match: { blockTime: { $gt: weekAgo } },
            };
            const [weekMissed, weekBlocks, totals] = await Promise.all([
                Schedule.countMisses(query),
                Schedule.countBlocks(query),
                Schedule.countTotals({ accounts }),
            ]);

            for (const item of items) {
                const { account } = item;
                const { count: weekProduced, latest } = weekBlocks[account] || {};
                const { blocksCount, missesCount } = totals[account] || {};

                item.weekProduced = weekProduced || 0;
                item.weekMissed = weekMissed[account] || 0;
                item.produced = blocksCount || 0;
                item.missed = missesCount || 0;
                item.latestBlock = latest;
            }

            const properties = await this._dataActualizer.getAgents({ accounts });
            const missing = [];

            for (const item of items) {
                const props = properties.find(({ account }) => account === item.account);

                if (props) {
                    let { fee, proxyLevel, minOwnStaked: minStake } = props;
                    if (fee !== undefined && proxyLevel !== undefined && minStake !== undefined) {
                        item.props = { fee, proxyLevel, minStake };
                    }
                }
                if (!item.props) {
                    missing.push([item.account, props]);
                }
            }

            if (missing.length) {
                Logger.error('Missing validators props: ', missing);
            }
        }

        return validators;
    }

    async getTokensExt() {
        const burned = ['cyber.null', 'kjcr1ce14ztf', 'i5cdnkenkvcd', 'yglszdxxo4xg']; // Golos miners,null,temp
        const cyberFunds = ['cyber.appfund', 'cyber.stake', 'cyber.worker', 'cyber.names'];
        const golosFunds = ['gls.vesting', 'gls.publish', 'gls.worker'];
        const [tokens, specialBalances] = await Promise.all([
            this._stateReader.getTokens(),
            this._stateReader.getBalances({ accounts: [...burned, ...cyberFunds, ...golosFunds] }),
        ]);

        const { items } = tokens;
        for (const item of items) {
            const { symbol } = item;
            const precision = (item.supply.split(' ')[0].split('.')[1] || '').length;
            const sum = specialBalances.items.reduce(
                (sum, x) => {
                    if (x.symbol === symbol) {
                        const key = burned.includes(x.account) ? 'nulls' : 'funds';
                        sum[key] += parseFloat(x.balance.split(' ')[0]);
                    }
                    return sum;
                },
                { nulls: 0, funds: 0 }
            );

            item.nulls = `${sum.nulls.toFixed(precision)} ${symbol}`;
            item.funds = `${sum.funds.toFixed(precision)} ${symbol}`;
        }

        return { items };
    }
}

module.exports = Chain;
