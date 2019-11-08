const BlockModel = require('../models/Block');
const MissedBlockModel = require('../models/MissedBlock');

const POINTS_IN_HOUR = 10;
const HOUR = 3600;

class Graphs {
    async getLastHourGraph() {
        const now = new Date();
        const nowTs = now.getTime();
        const hourAgo = new Date(now);
        const interval = HOUR / POINTS_IN_HOUR;

        hourAgo.setSeconds(hourAgo.getSeconds() - HOUR);

        const query = { blockTime: { $gt: hourAgo } };
        const fields = { blockTime: 1, producer: 1 };
        const [blocks, misses] = await Promise.all([
            BlockModel.find(
                query,
                { ...fields, 'counters.current.transactions.executed': 1 },
                { lean: true }
            ),
            MissedBlockModel.find(query, fields, { lean: true }),
        ]);

        const stats = Array.from({ length: POINTS_IN_HOUR }).map(() => 0);
        const missed = [...stats];
        const producers = {};
        const skippers = {};

        const putToIntervals = (items, stats, producers, adder) => {
            for (const item of items) {
                const timestamp = item.blockTime.getTime();
                const delta = Math.max(0, nowTs - timestamp) / 1000;
                const chunkIndex = Math.min(POINTS_IN_HOUR - 1, Math.floor(delta / interval));

                stats[chunkIndex] += adder(item);
                producers[item.producer] = (producers[item.producer] || 0) + 1;
            }
            stats.reverse();
        };

        putToIntervals(blocks, stats, producers, x => x.counters.current.transactions.executed);
        putToIntervals(misses, missed, skippers, () => 1);

        return {
            from: hourAgo,
            to: now,
            interval,
            series: stats.map(count => count / interval),
            missed,
            producers,
            skippers,
        };
    }
}

module.exports = Graphs;
