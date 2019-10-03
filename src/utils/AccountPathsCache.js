const core = require('cyberway-core-service');
const { Logger } = core.utils;
const AccountPathModel = require('../models/AccountPath');

class AccountPathsCache {
    constructor() {
        this._cache = new Map();
    }

    async get(account, action) {
        if (account === 'cyber') {
            switch (action) {
                case 'newaccount':
                    return [['creator'], ['name']];
                case 'updateauth':
                    return [['account'], ['auth', 'accounts', 'permission', 'actor']];
                case 'deleteauth':
                    return [['account']];
                case 'linkauth':
                case 'unlinkauth':
                    return [['account'], ['code']];
                default:
                // Do nothing
            }
        }

        if (account === 'cyber.domain') {
            switch (action) {
                case 'newusername':
                    return [['creator'], ['owner']];
                case 'newdomain':
                    return [['creator']];
                case 'passdomain':
                    return [['from'], ['to']];
                case 'linkdomain':
                    return [['owner'], ['to']];
                case 'unlinkdomain':
                    return [['owner']];
                default:
                // Do nothing
            }
        }

        if (account === 'gls.vesting') {
            switch (action) {
                case 'open':
                    return [['ram_payer'], ['owner']];
                case 'withdraw':
                    return [['from'], ['to']];
                case 'retire':
                    return [[], ['user']]; // signed by issuer
                // case 'delegate': // both signatures here
                // case 'undelegate': // this one is more tricky, "mention" party is one who didn't signed
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
                case 'setgrntterms':
                case 'delegateuse':
                case 'recalluse':
                case 'claim':
                    return [['grantor_name'], ['recipient_name']];
                case 'withdraw':
                case 'setkey':
                case 'setminstaked':
                case 'setproxyfee':
                case 'setproxylvl':
                case 'updatefunds':
                    return [['account']];
                case 'pick':
                    return [['accounts']];
                default:
                // Do nothing
            }
        }

        if (account === 'gls.publish') {
            switch (action) {
                case 'createmssg':
                case 'updatemssg':
                case 'deletemssg':
                    return [['message_id', 'author']];
                case 'upvote':
                case 'unvote':
                case 'downvote':
                    return [['voter'], ['message_id', 'author']];
                case 'reblog':
                case 'erasereblog':
                    return [['rebloger'], ['message_id', 'author']];
                default:
                // Do nothing
            }
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
