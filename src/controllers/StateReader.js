const core = require('cyberway-core-service');
const Basic = core.controllers.Basic;

class StateReader extends Basic {
    constructor(...args) {
        const getMethodsWhiteilst = [
            'Tokens',
            'Balances',
            'TopBalances',
            'Usernames',
            'Validators',
            'ReceivedGrants',
            'NameBids',
            'LastClosedBid',
            'Leaders',
            'Delegations',
        ];

        super(...args);
        for (const name of getMethodsWhiteilst) {
            const method = `get${name}`;

            this[method] = async params => {
                if (params === undefined) {
                    params = {};
                }
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
    async getValidators() {}
    async getReceivedGrants(params) {}
    async getNameBids(params) {}
    async getLastClosedBid() {}
    async getLeaders() {}
    async getDelegations(params) {}
    /* eslint-enable no-unused-vars */
}

module.exports = StateReader;
