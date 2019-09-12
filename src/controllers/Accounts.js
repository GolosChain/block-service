const AccountModel = require('../models/Account');

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
            account = {id: accountId};
        }

        if (!account.keys) {
            account.keys = {};
        }

        account.tokens = tokens;

        account.grants = await this._dataActualizer.getGrants({account: accountId});

        return account;
    }
}

module.exports = Accounts;
