const core = require('gls-core-service');
const { Logger } = core.utils;
const AccountPathModel = require('../models/AccountPath');

class AccountPathsCache {
    constructor() {
        this._cache = new Map();
    }

    async get(account, action) {
        if (account === 'gls.vesting') {
            switch (action) {
                case 'withdraw':
                    return [['from'], ['to']];
                default:
                // Do nothing
            }
        }

        if (account === 'cyber.token') {
            switch (action) {
                case 'open':
                case 'claim':
                case 'close':
                    return [['owner']];
                case 'create':
                    return [['issuer']];
                case 'issue':
                    return [['to']];
                case 'transfer':
                case 'payment':
                    return [['from'], ['to']];
                case 'bulkpayment':
                    return [['from'], ['recipients', 'to']];
                default:
                // Do nothing
            }
        }

        if (account === 'cyber.stake') {
            switch (action) {
                case 'open':
                    return [['owner'], ['ram_payer']];
                case 'delegatevote':
                case 'recallvote':
                case 'delegateuse':
                case 'recalluse':
                case 'claim':
                    return [['grantor_name'], ['recipient_name']];
                case 'withdraw':
                case 'setkey':
                case 'updatefunds':
                    return [['account']];
                case 'pick':
                    return [['accounts']];
                default:
                // Do nothing
            }
        }

        if (account === 'gls.publish' && action === 'upvote') {
            return [['voter'], ['message_id', 'author']];
        }

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
                Logger.warn(`AccountPath not found for contract: ${account}::${action}`);
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
