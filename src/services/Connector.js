const core = require('gls-core-service');
const BasicConnector = core.services.Connector;

class Connector extends BasicConnector {
    constructor({ blocks, graphs }) {
        super();

        this._blocks = blocks;
        this._graphs = graphs;
    }

    async start() {
        await super.start({
            serverRoutes: {
                getBlockList: {
                    handler: this._blocks.getBlockList,
                    scope: this._blocks,
                    inherits: ['limit', 'codeActionFilter'],
                    validation: {
                        required: [],
                        properties: {
                            fromBlockNum: {
                                type: 'number',
                                minValue: 1,
                            },
                            nonEmpty: {
                                type: 'boolean',
                                default: false,
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
                    inherits: ['limit', 'codeActionFilter'],
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
                            fromIndex: {
                                type: 'number',
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
                getBlockChainInfo: {
                    handler: this._blocks.getBlockChainInfo,
                    scope: this._blocks,
                    validation: {},
                },
                getLastHourGraph: {
                    handler: this._graphs.getLastHourGraph,
                    scope: this._graphs,
                    validation: {},
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
                    codeActionFilter: {
                        validation: {
                            properties: {
                                code: {
                                    type: 'string',
                                },
                                action: {
                                    type: 'string',
                                },
                                actor: {
                                    type: 'string',
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
