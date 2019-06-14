const core = require('gls-core-service');
const { splitEvery } = require('ramda');
const BasicService = core.services.Basic;
const { Logger } = core.utils;
const BlockSubscribe = core.services.BlockSubscribe;
const metrics = core.utils.metrics;
const BlockModel = require('../models/Block');
const ServiceMeta = require('../models/ServiceMeta');
const TransactionModel = require('../models/Transaction');

class Subscriber extends BasicService {
    async start() {
        await super.start();

        const meta = await ServiceMeta.findOne({}, {}, { lean: true });

        this._subscriber = new BlockSubscribe({
            lastSequence: (meta && meta.lastProcessedSequence) || 0,
            lastTime: (meta && meta.lastProcessedTime) || null,
            includeExpiredTransactions: true,
        });

        await this._subscriber.start();

        this._subscriber.eachBlock(this._handleNewBlock.bind(this));

        this._subscriber.on(
            'irreversibleBlockNum',
            this._setIrreversibleBlockNum.bind(this)
        );
    }

    /**
     * Обработка нового блока.
     * @param {Object} block
     * @private
     */
    async _handleNewBlock(block) {
        try {
            const blockModel = new BlockModel({
                id: block.id,
                parentId: block.parentId,
                blockNum: block.blockNum,
                blockTime: block.blockTime,
                transactionIds: block.transactions.map(
                    transaction => transaction.id
                ),
                transactionsCount: block.transactions.length,
            });

            await blockModel.save();

            metrics.inc('saved_blocks_count');
        } catch (err) {
            // В случае дубликации ничего не делаем.
            if (!(err.name === 'MongoError' && err.code === 11000)) {
                throw err;
            }
        }

        if (block.transactions.length) {
            const transactions = block.transactions.map((trx, index) => ({
                ...trx,
                index,
                blockId: block.id,
                blockNum: block.blockNum,
                blockTime: block.blockTime,
            }));

            try {
                await this._saveTransactions(transactions);
            } catch (err) {
                // В случае дубликации начинаем сохранять транзакции по одной игнорируя дубликаты
                if (err.name === 'BulkWriteError' && err.code === 11000) {
                    await this._saveTransactionsSeparately(transactions);
                } else {
                    throw err;
                }
            }
        }

        await ServiceMeta.updateOne(
            {},
            {
                lastProcessedSequence: block.sequence,
                lastProcessedTime: block.blockTime,
            },
            {
                upsert: true,
            }
        );

        console.log(
            `new block ${block.blockNum} saved, seq: ${block.sequence}, trx: ${block.transactions.length}`
        );
    }

    async _saveTransactions(transactions) {
        const chunks = splitEvery(100, transactions);

        for (const chunk of chunks) {
            await TransactionModel.insertMany(chunk);
        }

        metrics.inc('saved_transactions_count', transactions.length);
    }

    async _saveTransactionsSeparately(transactions) {
        for (const trx of transactions) {
            try {
                await TransactionModel.create(trx);

                metrics.inc('saved_transactions_count');
            } catch (err) {
                // В случае дублирования ничего не делаем.
                if (err.name === 'MongoError' && err.code === 11000) {
                    continue;
                }

                throw err;
            }
        }
    }

    async _setIrreversibleBlockNum(irreversibleBlockNum) {
        try {
            await ServiceMeta.updateOne(
                {},
                {
                    $set: {
                        irreversibleBlockNum,
                    },
                },
                { upsert: true }
            );
        } catch (err) {
            Logger.error('ServiceMeta saving failed:', err);
        }
    }
}

module.exports = Subscriber;
