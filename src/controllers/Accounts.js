const AccountModel = require('../models/Account');
const BalanceModel = require('../models/TokenBalance');

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

        account.grants = await this._dataActualizer.getGrants({
            account: accountId,
        });
        const balances = await BalanceModel.aggregate([
            {
                $match: {
                    account: accountId,
                },
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
        account.tokens = tokens;

        return account;
    }
}

module.exports = Accounts;
