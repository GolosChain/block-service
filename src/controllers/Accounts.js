const AccountModel = require('../models/Account');
const BalanceModel = require('../models/TokenBalance');
const StakeAgentModel = require('../models/StakeAgent');
const { saveModelIgnoringDups } = require('../utils/common');

class Accounts {
    constructor({ dataActualizer }) {
        this._dataActualizer = dataActualizer;
    }

    async getAccount({ accountId }) {
        let account = await AccountModel.findOne(
            { id: accountId },
            {
                _id: false,
                id: true,
                golosId: true,
                blockId: true,
                keys: true,
                registrationTime: true,
            },
            { lean: true }
        );

        if (!account) {
            // There can be no info about account creation (if genesis skipped), but other info can exist
            account = { id: accountId };
        }

        if (!account.keys) {
            account.keys = {};
        }

        await Promise.all([
            (async () => {
                account.grants = await this._dataActualizer.getGrants({ account: accountId });
            })(),
            (async () => {
                account.tokens = await this.getTokens(accountId);
            })(),
            (async () => {
                account.agentProps = await this.getAgentProps(accountId);
            })(),
        ]);

        return account;
    }

    async getTokens(account) {
        const balances = await BalanceModel.aggregate([
            {
                $match: { account },
            },
            {
                $group: {
                    _id: '$symbol',
                    doc: {
                        $first: '$$ROOT',
                    },
                },
            },
            {
                $sort: {
                    _id: 1,
                },
            },
        ]);

        const tokens = [];
        if (balances && balances.length) {
            for (const balance of balances) {
                const doc = balance.doc;
                tokens.push({
                    balance: doc.balance,
                    payments: doc.payments,
                    blockNum: doc.blockNum,
                });
            }
        }
        return tokens;
    }

    async getAgentProps(account) {
        let props = await StakeAgentModel.findOne(
            {
                account,
                symbol: 'CYBER',
            },
            {},
            {
                sort: { blockNum: -1 },
                lean: true,
            }
        );

        if (!props) {
            // Can't remove this branch even if read agents from genesis: agents can be created without event
            // TODO: replace with `blockchain-storage-proxy` when ready
            props = await this._dataActualizer.getAgent(account);
            if (props) {
                const info = await this._dataActualizer.getInfo();
                const { fee, proxyLevel, minStake } = props;

                const agentModel = new StakeAgentModel({
                    blockNum: info.head_block_num,
                    account,
                    symbol: 'CYBER',
                    fee,
                    proxyLevel,
                    minStake,
                });

                saveModelIgnoringDups(agentModel);
            }
        }

        if (!props) {
            return null;
        }

        const { fee, proxyLevel, minStake } = props;
        return {
            fee,
            proxyLevel,
            minStake,
        };
    }
}

module.exports = Accounts;
