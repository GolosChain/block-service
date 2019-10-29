const core = require('cyberway-core-service');
const { Logger } = core.utils;
const AccountPathModel = require('../models/AccountPath');

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

    // TODO: when update system/dapp contract, use new abi instead of hardcoded paths
    async get(account, action) {
        if (account === 'cyber') {
            switch (action) {
                case 'newaccount':
                    return [
                        'creator',
                        'name',
                        'owner/accounts/permission/actor',
                        'active/accounts/permission/actor',
                    ];
                case 'updateauth':
                    return ['account', 'auth/accounts/permission/actor'];
                case 'deleteauth':
                    return ['account'];
                case 'linkauth':
                case 'unlinkauth':
                    return ['account', 'code'];
                case 'setcode':
                case 'setabi':
                    return ['account'];
                case 'reqauth':
                    return ['from'];
                case 'bidname':
                    return ['bidder', 'newname'];
                case 'bidrefund':
                    return ['bidder'];
                case 'providebw':
                    return ['provider', 'account'];
                case 'checkwin':
                    return [];
                default:
                // Do nothing
            }
        }

        if (account === 'cyber.domain') {
            switch (action) {
                case 'newusername':
                    return ['creator', 'owner'];
                case 'newdomain':
                    return ['creator'];
                case 'passdomain':
                    return ['from', 'to'];
                case 'linkdomain':
                    return ['owner', 'to'];
                case 'unlinkdomain':
                    return ['owner'];
                case 'biddomain':
                case 'biddmrefund':
                    return ['bidder'];
                case 'checkwin':
                    return [];
                // TODO: declarenames should be hanled specially #53
                default:
                // Do nothing
            }
        }

        if (account === 'cyber.govern') {
            // only internal
            Logger.warn(`Unexpected: ${account}::${action}`);
        }

        if (account === 'cyber.msig') {
            switch (action) {
                case 'propose':
                    return ['proposer', 'requested/actor'];
                case 'approve':
                case 'unapprove':
                    return ['proposer', 'level/actor'];
                case 'cancel':
                    return ['proposer', 'canceler'];
                case 'exec':
                    return ['proposer', 'executer'];
                case 'invalidate':
                    return ['account'];
                default:
                // Do nothing
            }
        }

        if (account === 'gls.vesting') {
            switch (action) {
                case `setparams`:
                    return ['params/provider/actor'];
                case 'open':
                    return ['owner', 'ram_payer'];
                case 'withdraw':
                    return ['from', 'to'];
                case 'retire':
                    return ['user'];
                case 'stopwithdraw':
                case 'unlocklimit':
                case 'close':
                    return ['owner'];
                case 'delegate':
                case 'undelegate':
                    return ['delegator', 'delegatee'];
                case 'create':
                    return ['notify_acc'];
                case 'procwaiting':
                    return ['payer'];
                default:
                // Do nothing
            }
        }

        if (account === 'cyber.token') {
            switch (action) {
                case 'open':
                    return ['owner', 'ram_payer'];
                case 'claim':
                case 'close':
                    return ['owner'];
                case 'create':
                    return ['issuer'];
                case 'issue':
                    return ['to'];
                case 'retire':
                    return [];
                case 'transfer':
                case 'payment':
                    return ['from', 'to'];
                case 'bulkpayment':
                    return ['from', 'recipients/to'];
                default:
                // Do nothing
            }
        }

        if (account === 'cyber.stake') {
            switch (action) {
                case 'create':
                case 'enable':
                    return [];
                case 'open':
                    return ['owner', 'ram_payer'];
                case 'delegatevote':
                case 'recallvote':
                case 'setgrntterms':
                case 'delegateuse':
                case 'recalluse':
                case 'claim':
                    return ['grantor_name', 'recipient_name'];
                case 'withdraw':
                case 'setkey':
                case 'setminstaked':
                case 'setproxyfee':
                case 'setproxylvl':
                case 'updatefunds':
                    return ['account'];
                case 'pick':
                    return ['accounts'];
                // case 'reward': // only called internally, have no named field; TODO: resolve
                //     return ['rewards/0'];
                default:
                // Do nothing
            }
        }

        if (account === 'gls.emit') {
            switch (action) {
                case 'setparams':
                    return ['params/pools/name', 'params/provider/actor'];
                case 'emit':
                case 'start':
                case 'stop':
                    return [];
                default:
                // Do nothing
            }
        }

        if (account === 'gls.publish') {
            switch (action) {
                case 'createmssg':
                    return ['message_id/author', 'parent_id/author', 'beneficiaries/account'];
                case 'updatemssg':
                case 'deletemssg':
                case 'setcurprcnt':
                case 'setmaxpayout':
                case 'paymssgrwrd':
                    return ['message_id/author'];
                case 'upvote':
                case 'unvote':
                case 'downvote':
                    return ['voter', 'message_id/author'];
                case 'reblog':
                case 'erasereblog':
                    return ['rebloger', 'message_id/author'];
                case 'setrules':
                case 'setlimits':
                    return [];
                case 'setparams':
                    return ['params/value', 'params/actor'];
                case 'calcrwrdwt':
                case 'deletevotes':
                    return ['account'];
                case 'closemssgs':
                    return ['payer'];
                case 'addpermlink':
                    return ['msg/author', 'parent/author'];
                case 'addpermlinks':
                    return ['permlinks/msg/author', 'permlinks/parent/author'];
                case 'delpermlink':
                    return ['msg/author'];
                case 'delpermlinks':
                    return ['permlinks/author'];
                default:
                    break;
            }
        }

        if (account === 'gls.ctrl') {
            switch (action) {
                case 'setparams':
                    return ['params/name', 'params/provider/actor'];
                case 'regwitness':
                case 'unregwitness':
                case 'stopwitness':
                case 'startwitness':
                    return ['witness'];
                case 'votewitness':
                case 'unvotewitn':
                    return ['voter', 'witness'];
                case 'changevest':
                    return ['who'];
                default:
                // Do nothing
            }
        }

        if (account === 'gls.charge') {
            switch (action) {
                case 'use':
                case 'usenotifygt':
                case 'usenotifylt':
                    return ['user'];
                case 'setrestorer':
                    return [];
                default:
                // Do nothing
            }
        }

        if (account === 'gls.social') {
            switch (action) {
                case 'pin':
                case 'addpin':
                case 'unpin':
                    return ['pinner', 'pinning'];
                case 'block':
                case 'addblock':
                case 'unblock':
                    return ['blocker', 'blocking'];
                case 'updatemeta':
                case 'deletemeta':
                    return ['account'];
                default:
                // Do nothing
            }
        }

        if (account === 'gls.referral') {
            switch (action) {
                case 'setparams':
                case 'closeoldref':
                    return [];
                case 'addreferral':
                    return ['referrer', 'referral'];
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
