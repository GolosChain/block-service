const AccountModel = require('../models/Account');

const AccountsProjection = {
    _id: false,
    id: true,
    golosId: true,
};

class Accounts {
    async getAccounts({ prefix, limit }) {
        const query = {};

        if (prefix) {
            query.id = {
                $regex: `^${prefix}`,
            };
        }

        const accounts = await AccountModel.find(query, AccountsProjection, {
            lean: true,
            limit,
            sort: {
                id: 1,
            },
        });

        let golosAccounts = [];

        if (prefix && accounts.length < limit) {
            golosAccounts = await await AccountModel.find(
                {
                    golosId: {
                        $regex: `^${prefix}`,
                    },
                },
                AccountsProjection,
                {
                    lean: true,
                    limit: limit - accounts.length,
                    sort: {
                        golosId: 1,
                    },
                }
            );
        }

        return {
            items: [...accounts, ...golosAccounts],
        };
    }

    async getAccount({ accountId }) {
        const account = await AccountModel.findOne(
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
            throw {
                code: 404,
                message: 'Account not found',
            };
        }

        if (!account.keys) {
            account.keys = {};
        }

        return account;
    }
}

module.exports = Accounts;
