const AccountModel = require('../models/Account');

class Accounts {
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
