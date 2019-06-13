const core = require('gls-core-service');
const BasicService = core.services.Basic;
const BlockSubscribe = core.services.BlockSubscribe;

class Subscriber extends BasicService {
    constructor() {
        super();
        this._subscriber = new BlockSubscribe();
    }

    async start() {}
}

module.exports = Subscriber;
