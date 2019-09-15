const StakeAgentModel = require('../models/StakeAgent');
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
        return await this._dataActualizer.getInfo()
    }

    async getValidators() {
        const validators = await this._dataActualizer.getValidators();
        const { items } = validators;
        if (items.length) {
            const accounts = items.map(({account}) => account);
            const properties = await StakeAgentModel.find(
                {
                    account: { $in: accounts },
                    symbol: 'CYBER',
                },
                {},
                {
                    sort: { blockNum: -1 },
                    lean: true
                }
            );
            const missing = [];
            items.forEach(item => {
                const props = properties.find(({ account }) => account == item.account);
                if (props) {
                    const { fee, proxyLevel, minStake } = props;
                    item.props = {
                        fee,
                        proxyLevel,
                        minStake,
                    };
                } else {
                    missing.push(item.account);
                }
            });
            if (missing) {
                // this branch allows to fetch missing agents info from api without "replaying" events,
                // but it makes 50+ requests first time. also it's not precise in case of fork (block num can change).
                // This mechanism should be removed when filling data from genesis become ready
                const info = await this._dataActualizer.getInfo({ force: true });
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
                            minStake
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
