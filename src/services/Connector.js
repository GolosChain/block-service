const env = require('../data/env');
const core = require('cyberway-core-service');
const BasicConnector = core.services.Connector;

class Connector extends BasicConnector {
    constructor({ blocks, graphs, accounts, chain }) {
        super();

        this._blocks = blocks;
        this._graphs = graphs;
        this._accounts = accounts;
        this._chain = chain;
    }

    async start() {
        await super.start({
            serverRoutes: {
                getBlockList: {
                    handler: this._blocks.getBlockList,
                    scope: this._blocks,
                    inherits: ['limit', 'actionFilters'],
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
                    inherits: ['limit', 'actionFilters'],
                    validation: {
                        required: ['blockId'],
                        properties: {
                            blockId: {
                                type: 'string',
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
                getAccount: {
                    handler: this._accounts.getAccount,
                    scope: this._accounts,
                    validation: {
                        required: ['accountId'],
                        properties: {
                            accountId: {
                                type: 'string',
                            },
                        },
                    },
                },
                getAccountTransactions: {
                    handler: this._blocks.getAccountTransactions,
                    scope: this._blocks,
                    inherits: ['actionFilters'],
                    validation: {
                        required: ['accountId'],
                        properties: {
                            accountId: {
                                type: 'string',
                            },
                            type: {
                                type: 'string',
                                enum: ['all', 'actor', 'mention'],
                                default: 'all',
                            },
                            sequenceKey: {
                                type: 'string',
                            },
                            limit: {
                                type: 'number',
                                default: 10,
                                minValue: 1,
                                maxValue: 20,
                            },
                        },
                    },
                },
                getLastHourGraph: {
                    handler: this._graphs.getLastHourGraph,
                    scope: this._graphs,
                    validation: {},
                },
                getProducers: {
                    handler: this._chain.getProducers,
                    scope: this._chain,
                    validation: {},
                },
                getValidators: {
                    handler: this._chain.getValidators,
                    scope: this._chain,
                    validation: {},
                },
                getTokensExt: {
                    handler: this._chain.getTokensExt,
                    scope: this._chain,
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
                    actionFilters: {
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
                                event: {
                                    type: 'string',
                                },
                            },
                        },
                    },
                },
            },
            requiredClients: {
                stateReader: env.CBW_STATE_READER_CONNECT,
            },
        });
    }
}

module.exports = Connector;
