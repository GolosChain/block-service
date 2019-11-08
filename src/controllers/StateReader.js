const core = require('cyberway-core-service');
const Basic = core.controllers.Basic;

class StateReader extends Basic {
    constructor(...args) {
        super(...args);

        const getMethodsWhiteilst = [
            'Tokens',
            'Balances',
            'TopBalances',
            'Usernames',
            'Domains',
            'Validators',
            'ReceivedGrants',
            'NameBids',
            'LastClosedBid',
            'Leaders',
            'Delegations',
            'StakeStat',
            'StakeAgents',
            'StakeGrants',
            'StakeCandidates',
            'Proposals',
            'ProposalApprovals',
            'Permissions',
            'PermissionLinks',
            'ResState',
            'ResConfig',
        ];

        for (const name of getMethodsWhiteilst) {
            const method = `get${name}`;

            this[method] = async (params = {}) => {
                return await this._callService({ params, method });
            };
        }
    }

    async _callService({ method, params }) {
        return await this.callService('stateReader', method, params);
    }

    // the following are just definitions (for IDE/tools), bodies will be override in constructor
    /* eslint-disable no-unused-vars */
    async getTokens() {}
    async getBalances(params) {}
    async getTopBalances(params) {}
    async getUsernames(params) {}
    async Domains(params) {}
    async getValidators() {}
    async getReceivedGrants(params) {}
    async getNameBids(params) {}
    async getLastClosedBid() {}
    async getLeaders() {}
    async getDelegations(params) {}
    async getStakeStat(params) {}
    async getStakeAgents(params) {}
    async getStakeGrants(params) {}
    async getStakeCandidates(params) {}
    async Proposals(params) {}
    async ProposalApprovals(params) {}
    async Permissions(params) {}
    async PermissionLinks(params) {}
    async ResState() {}
    async ResConfig() {}
    /* eslint-enable no-unused-vars */
}

module.exports = StateReader;
