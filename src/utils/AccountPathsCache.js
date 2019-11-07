const core = require('cyberway-core-service');
const { Logger } = core.utils;
const AccountPathModel = require('../models/AccountPath');
const KNOWN_ACTIONS = require('./KnownAccountPaths');

class AccountPathsCache {
    constructor() {
        this._cache = new Map();
        this._reCache = {};
    }

    _accountFromTransferMemo({ to, memo, accounts }) {
        const matcher = '([a-z0-5][a-z0-5.]{0,11})';
        let re = false;

        switch (to) {
            case 'gls.vesting':
                re = `^send to: ${matcher};`;
                break;
            case 'cyber.stake':
                re = `^${matcher}( |$)`;
                break;
        }

        if (re) {
            let regexp = this._reCache[re];
            if (!regexp) {
                regexp = new RegExp(re);
                this._reCache[re] = regexp;
            }
            const match = memo.match(regexp);
            if (match) {
                accounts[match[1]] = true;
            }
        }
        accounts[to] = true;
    }

    extractIndirectAccounts({ code, action, args, accounts }) {
        let extracted = false;

        if (code === 'cyber.token') {
            const { from, to, recipients, memo } = args;

            switch (action) {
                case 'transfer':
                    this._accountFromTransferMemo({ to, memo, accounts });
                    extracted = true;
                    break;

                case 'bulktransfer':
                    for (const { to, memo } of recipients) {
                        this._accountFromTransferMemo({ to, memo, accounts });
                    }
                    extracted = true;
                    break;
            }

            if (extracted) {
                accounts[from] = true;
            }
        }
        return extracted;
    }

    async get(account, action) {
        if (account === 'cyber.govern') {
            // only internal
            Logger.warn(`Unexpected: ${account}::${action}`);
        }

        // TODO: when update system/dapp contract, use new abi instead of hardcoded paths
        const known = (KNOWN_ACTIONS[account] || {})[action];
        if (known) {
            return known;
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
                Logger.warn(`AccountPath not found for action: ${account}::${action}`);
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
