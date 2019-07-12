const core = require('gls-core-service');
const { Logger } = core.utils;
const AccountPathModel = require('../models/AccountPath');

class AccountPathsCache {
    constructor() {
        this._cache = new Map();
    }

    async get(account, action) {
        let accountCache = this._cache.get(account);

        if (!accountCache) {
            accountCache = {};
            this._cache.set(account, accountCache);
        }

        let actionPathsModel = accountCache[action];

        if (!actionPathsModel) {
            actionPathsModel = await AccountPathModel.findOne(
                {
                    account,
                    action,
                },
                {},
                {
                    lean: true,
                    sort: {
                        blockNum: -1,
                    },
                }
            );

            if (!actionPathsModel) {
                Logger.warn(
                    `AccountPath not found for contract: ${account}::${action}`
                );
                actionPathsModel = {};
            }

            accountCache[action] = actionPathsModel;
        }

        return actionPathsModel.accountPaths || null;
    }

    delete(account) {
        this._cache.delete(account);
    }

    deleteNewerThanBlockNum(blockNum) {
        for (const [account, model] of this._cache) {
            if (model.blockNum > blockNum) {
                this._cache.delete(account);
            }
        }
    }
}

module.exports = AccountPathsCache;
