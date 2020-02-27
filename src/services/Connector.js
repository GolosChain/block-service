const VERSION = require('../../package.json').version;
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
                                type: 'integer',
                                minimum: 1,
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
                        properties: {
                            blockId: {
                                type: 'string',
                            },
                            blockNum: {
                                type: 'integer',
                            },
                            blockTime: {
                                type: 'string',
                                format: 'date-time',
                            },
                        },
                    },
                },
                getBlockTime: {
                    handler: this._blocks.getBlockTime,
                    scope: this._blocks,
                    validation: {
                        required: ['blockNums'],
                        properties: {
                            blockNums: {
                                type: 'array',
                                items: { type: 'integer', minimum: 1 },
                                minItems: 1,
                                uniqueItems: true,
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
                                type: 'integer',
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
                getProposals: {
                    handler: this._accounts.getProposals,
                    scope: this._accounts,
                    validation: {
                        required: ['proposer'],
                        properties: {
                            proposer: { type: 'string' },
                        },
                    },
                },
                getProposal: {
                    handler: this._accounts.getProposal,
                    scope: this._accounts,
                    validation: {
                        required: ['proposer', 'name'],
                        properties: {
                            proposer: { type: 'string' },
                            name: { type: 'string' },
                        },
                    },
                },
                getAccount: {
                    handler: this._accounts.getAccount,
                    scope: this._accounts,
                    validation: {
                        required: ['name'],
                        properties: {
                            name: { type: 'string' },
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
                                type: 'integer',
                                default: 10,
                                minimum: 1,
                                maximum: 20,
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
                getVersion: {
                    handler: () => ({ version: VERSION }),
                    validation: {},
                },
            },
            serverDefaults: {
                parents: {
                    limit: {
                        validation: {
                            properties: {
                                limit: {
                                    type: 'integer',
                                    default: 10,
                                    minimum: 1,
                                    maximum: 50,
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
