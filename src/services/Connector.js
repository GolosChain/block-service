const core = require('gls-core-service');
const BasicConnector = core.services.Connector;

class Connector extends BasicConnector {
    constructor({ blocks }) {
        super();

        this._blocks = blocks;
    }

    async start() {
        await super.start({
            serverRoutes: {
                getBlockList: {
                    handler: this._blocks.getBlockList,
                    scope: this._blocks,
                    inherits: ['limit'],
                    validation: {
                        required: [],
                        properties: {
                            fromBlockNum: {
                                type: 'number',
                                minValue: 1,
                            },
                        },
                    },
                },
                getBlock: {
                    handler: this._blocks.getBlock,
                    scope: this._blocks,
                    validation: {
                        required: ['blockId'],
                        properties: {
                            blockId: {
                                type: 'string',
                            },
                        },
                    },
                },
                getBlockTransactions: {
                    handler: this._blocks.getBlockTransactions,
                    scope: this._blocks,
                    inherits: ['limit'],
                    validation: {
                        required: ['blockId'],
                        properties: {
                            blockId: {
                                type: 'string',
                            },
                            status: {
                                type: 'string',
                                enum: ['all', 'executed', 'expired'],
                            },
                            startTransactionId: {
                                type: 'string',
                            },
                        },
                    },
                },
                getTransaction: {
                    handler: this._blocks.getTransaction,
                    scope: this._blocks,
                    validation: {
                        required: ['transactionId'],
                        properties: {
                            transactionId: {
                                type: 'string',
                            },
                        },
                    },
                },
                findEntity: {
                    handler: this._blocks.findEntity,
                    scope: this._blocks,
                    validation: {
                        required: ['text'],
                        properties: {
                            text: {
                                type: 'string',
                            },
                        },
                    },
                },
            },
            serverDefaults: {
                parents: {
                    limit: {
                        validation: {
                            properties: {
                                limit: {
                                    type: 'number',
                                    default: 10,
                                    minValue: 1,
                                    maxValue: 50,
                                },
                            },
                        },
                    },
                },
            },
        });
    }
}

module.exports = Connector;
