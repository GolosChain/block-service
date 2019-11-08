const AccountModel = require('../models/Account');
const BalanceModel = require('../models/TokenBalance');
const Schedule = require('../controllers/Schedule');
const { dateToBucketId, parseName } = require('../utils/common');

class Accounts {
    constructor({ dataActualizer }) {
        this._dataActualizer = dataActualizer;
    }

    setStateReader(reader) {
        this._stateReader = reader;
    }

    async getAccount({ name }) {
        const parsed = parseName(name);
        const { bad, domain, username } = parsed; // TODO: further validate before process
        let accountId = parsed.account;

        if (!bad && domain) {
            accountId = ((await this._dataActualizer.getDomain(domain)) || {}).linkedTo;
        }
        if (!bad && username && accountId) {
            const query = { name: username, scope: accountId };
            accountId = await this._dataActualizer.resolveUsername(query);
        }
        if (bad) {
            throw { code: 500, message: 'Invalid account name' };
        }
        if (!accountId) {
            throw { code: 404, message: 'Account not found' };
        }

        let account = await AccountModel.findOne(
            { id: accountId },
            {
                _id: false,
                id: true,
                golosId: true,
                blockId: true,
                keys: true,
                registrationTime: true,
                creator: true,
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

        const [grants, tokens, buckets, perms, plinks] = await Promise.all([
            this._dataActualizer.getGrants({ account: accountId }),
            this.getTokens({ account: accountId }),
            Schedule.getBuckets({ accounts: [accountId] }),
            this._stateReader.getPermissions({ owner: accountId, limit: 100 }),
            this._stateReader.getPermissionLinks({ account: accountId, limit: 100 }),
        ]);

        const agentsToGet = [accountId, ...grants.items.map(({ recipient }) => recipient)];
        const agents = await this._dataActualizer.getAgents({
            accounts: agentsToGet,
            includeShare: true,
        });
        const agentProps = agents.find(({ account }) => account == accountId);

        for (const grant of grants.items) {
            grant.agent = agents.find(({ account }) => account == grant.recipient);
        }

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

        const permissions = {};
        for (const { parent, name, auth, lastUpdated } of perms.items) {
            permissions[name] = {
                auth,
                parent: parent === 0 ? undefined : perms.items.find(({ id }) => id === parent).name,
                lastUpdated,
            };
        }

        return {
            ...account,
            permissions,
            permissionLinks: plinks.items,
            grants,
            tokens,
            agentProps,
            producingStats,
        };
    }

    async getTokens({ account }) {
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
}

module.exports = Accounts;
