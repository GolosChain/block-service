const BlockModel = require('../models/Block');

const POINTS_IN_HOUR = 10;
const HOUR = 3600;

class Graphs {
    async getLastHourGraph() {
        const now = new Date();
        const nowTs = now.getTime();
        const hourAgo = new Date(now);

        const interval = HOUR / POINTS_IN_HOUR;

        hourAgo.setSeconds(hourAgo.getSeconds() - HOUR);

        const blocks = await BlockModel.find(
            {
                blockTime: {
                    $gt: hourAgo,
                },
            },
            {
                blockTime: 1,
                'counters.current.transactions.executed': 1,
            },
            {
                lean: true,
            }
        );

        let stats = Array.from({ length: POINTS_IN_HOUR }).map(() => 0);

        for (const block of blocks) {
            const timestamp = block.blockTime.getTime();
            const delta = Math.max(0, nowTs - timestamp) / 1000;
            const chunkIndex = Math.min(POINTS_IN_HOUR - 1, Math.floor(delta / interval));

            stats[chunkIndex] += block.counters.current.transactions.executed;
        }

        stats.reverse();

        stats = stats.map(count => Math.round(count / interval));

        return {
            from: hourAgo,
            to: now,
            interval,
            series: stats,
        };
    }
}

module.exports = Graphs;
