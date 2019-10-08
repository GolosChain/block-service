const AccountModel = require('../models/Account');
const BalanceModel = require('../models/TokenBalance');
const StakeAgentModel = require('../models/StakeAgent');
const Schedule = require('../controllers/Schedule');
const { saveModelIgnoringDups, dateToBucketId } = require('../utils/common');

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

        const [grants, tokens, agentProps, buckets] = await Promise.all([
            this._dataActualizer.getGrants({ account: accountId }),
            this.getTokens(accountId),
            this.getAgentProps(accountId),
            Schedule.getBuckets({ accounts: [accountId] }),
        ]);

        let producingStats = { buckets };
        const now = new Date();
        const bucketId = dateToBucketId(now);
        const currentBucket = buckets.find(x => x.bucket === bucketId);

        if (currentBucket) {
            const dayAgo = new Date(now.getTime() - 1000 * 3600 * 24);
            const weekAgo = new Date(now.getTime() - 1000 * 3600 * 24 * 7);
            const matchD = { blockTime: { $gt: dayAgo } };
            const matchW = { blockTime: { $gt: weekAgo } };
            const queryD = { producers: [accountId], match: matchD };
            const queryW = { ...queryD, match: matchW };
            const counts = await Promise.all([
                Schedule.countBlocks(queryD),
                Schedule.countMisses(queryD),
                Schedule.countBlocks(queryW),
                Schedule.countMisses(queryW),
            ]);
            const [dayBlocks, dayMisses, weekBlocks, weekMisses] = counts.map(x => x[accountId]);

            producingStats = { buckets, dayBlocks, dayMisses, weekBlocks, weekMisses };
        }

        return { ...account, grants, tokens, agentProps, producingStats };
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

        if (!props || props.proxyLevel === undefined) {
            // Can't remove this branch even if read agents from genesis: agents can be created without event
            // TODO: replace with `state-reader` when ready
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

        let { fee, proxyLevel, minStake } = props;

        if (fee === undefined) {
            fee = 10000;
        }

        if (minStake === undefined) {
            minStake = 0;
        }

        return {
            fee,
            proxyLevel,
            minStake,
        };
    }
}

module.exports = Accounts;
