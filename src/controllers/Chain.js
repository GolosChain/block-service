const StakeAgentModel = require('../models/StakeAgent');
const Schedule = require('./Schedule');
class Chain {
    constructor({ dataActualizer }) {
        this._dataActualizer = dataActualizer;
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

            const properties = await StakeAgentModel.find(
                {
                    account: { $in: accounts },
                    symbol: 'CYBER',
                },
                {},
                {
                    sort: { blockNum: -1 },
                    lean: true,
                }
            );
            const missing = [];

            for (const item of items) {
                const props = properties.find(({ account }) => account === item.account);

                if (props && props.proxyLevel !== undefined) {
                    let { fee, proxyLevel, minStake } = props;

                    if (fee === undefined) {
                        fee = 10000;
                    }

                    if (minStake === undefined) {
                        minStake = 0;
                    }

                    item.props = {
                        fee,
                        proxyLevel,
                        minStake,
                    };
                } else {
                    missing.push(item.account);
                }
            }

            if (missing) {
                // this branch allows to fetch missing agents info from api without "replaying" events,
                // but it makes 50+ requests first time. also it's not precise in case of fork (block num can change).
                // This mechanism should be removed when filling data from genesis become ready
                const info = await this._dataActualizer.getInfo();
                for (const acc of missing) {
                    const props = await this._dataActualizer.getAgent(acc);

                    if (props) {
                        const { fee, proxyLevel, minStake } = props;
                        const item = items.find(({ account }) => account === acc);

                        item.props = {
                            fee,
                            proxyLevel,
                            minStake,
                        };

                        const agentModel = new StakeAgentModel({
                            blockNum: info.head_block_num,
                            account: acc,
                            symbol: 'CYBER',
                            fee,
                            proxyLevel,
                            minStake,
                        });

                        try {
                            await agentModel.save();
                        } catch (err) {
                            if (!(err.name === 'MongoError' && err.code === 11000)) {
                                throw err;
                            }
                        }
                    }
                }
            }
        }

        return validators;
    }
}

module.exports = Chain;
