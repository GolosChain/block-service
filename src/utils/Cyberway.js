const { JsonRpc, Api } = require('cyberwayjs');
const fetch = require('node-fetch');
const { TextEncoder, TextDecoder } = require('text-encoding');
const JsSignatureProvider = require('cyberwayjs/dist/eosjs-jssig').default;

const env = require('../data/env');

class CyberwayClient {
    static get() {
        if (!CyberwayClient._client) {
            CyberwayClient._client = new CyberwayClient();
        }

        return CyberwayClient._client;
    }

    constructor() {
        const rpc = new JsonRpc(env.GLS_CYBERWAY_CONNECT, { fetch });

        const signatureProvider = new JsSignatureProvider([]);

        this.api = new Api({
            rpc,
            signatureProvider,
            textDecoder: new TextDecoder(),
            textEncoder: new TextEncoder(),
        });
    }

    rawAbiToJson(rawAbi) {
        return this.api.rawAbiToJson(rawAbi);
    }

    deserializeTrx(binTrx) {
        const bytes =
            typeof binTrx === 'string' ? Uint8Array.from(Buffer.from(binTrx, 'hex')) : binTrx;
        return this.api.deserializeTransaction(bytes);
    }
}

module.exports = CyberwayClient;
