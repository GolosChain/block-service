const BlockModel = require('../models/Block');

class BlockUtils {
    async getBlockTime({ blockNums, asObj = false }) {
        if (!blockNums.length) {
            return asObj ? {} : [];
        }

        const items = await BlockModel.find(
            { blockNum: { $in: blockNums } },
            { _id: 0, blockNum: 1, blockTime: 1 },
            { lean: true }
        );

        if (!asObj) {
            return items;
        }

        const blocks = {};

        for (const i of items) {
            blocks[i.blockNum] = i.blockTime;
        }
        return blocks;
    }

    async addBlockTime(itemOrItems) {
        const items = [].concat(itemOrItems);
        const blockNums = [];

        for (const i of items) {
            if (i.blockNum) {
                blockNums.push(i.blockNum);
            }
        }

        const times = await this.getBlockTime({ blockNums, asObj: true });

        for (const i of items) {
            i.blockTime = times[i.blockNum];
        }
    }
}

module.exports = BlockUtils;
