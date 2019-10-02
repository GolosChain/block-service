const core = require('cyberway-core-service');
const { Logger } = core.utils;
const LogModel = require('../models/Log');
const MissedBlockModel = require('../models/MissedBlock');

class Schedule {
    constructor() {
        this.queue = [];
        this.schedule = [];
        this.blockNum = 1;
        this.blockTime = null;
        this.mustSync = true;
        this.syncState = {};
    }

    init({ producer, schedule }) {
        this.schedule = schedule;

        // the edge case: when process last schedule index, there is no info on the schedule,
        // so idx can get any value (wrong). can't detect it here.
        let idx = schedule.indexOf(producer);
        let q = [].concat(this.schedule);
        Logger.log('Init schedule:', producer, schedule, idx, this.blockNum);

        if (idx === this.length - 1 || this.blockNum === 2) {
            // this only possible if schedule changed from [a1,a1,...,an] to [b1,b2,...an]
            Logger.info('Init with last index');
        } else {
            // idx can be -1 here, it means random producer was the last in previous schedule
            while (idx >= 0) {
                q.shift();
                idx--;
            }
        }
        this.queue = q;
        this.mustSync = false;
    }

    async processBlock({ producer, schedule, blockNum, blockTime }) {
        const prevTime = this.blockTime || blockTime;
        let missed = (blockTime - prevTime) / 3000 - 1;
        this.blockTime = blockTime;
        this.blockNum = blockNum;

        if (missed > 21) {
            this.fatality('Chain stop');
            this.syncState = {}; // syncState is useless at this point, just skip
        }
        if (missed > 21 || missed < 0) {
            missed = 0;
        }

        if (this.mustSync) {
            const q = this.syncState.queue;
            if (q !== undefined) {
                // special sync case to detect correct schedule switch point
                let prevMissed = this.syncState.missed;
                const idx = this.schedule.indexOf(producer);
                let countInPrev = prevMissed - (idx - missed) + 1; // +1 for good producer from previous block
                // special cases with 1-producer-schedule early change (idx,q.len):
                // 0,1 on blocks 177011,189186,215311,300995,553022,612883,619482,636906,722976,736315,746893,804760,963004,996953,997695,1016453,1139808
                // 1,1 on block 1171489
                // 0,2 on block 1189341
                const twoScheduleChanges =
                    countInPrev == q.length + 1 && (idx === missed) == 0 && q.length === prevMissed;
                if (twoScheduleChanges) {
                    this.log(`2 schedule changes: ${idx},${q.length}`);
                }
                if (countInPrev <= q.length || twoScheduleChanges) {
                    const skippers = [];
                    while (countInPrev > 0 && prevMissed > 0) {
                        skippers.push(q.shift());
                        countInPrev--;
                        prevMissed--;
                    }
                    while (prevMissed > 0) {
                        skippers.push(this.queue.shift());
                        prevMissed--;
                    }
                    if (!countInPrev && !twoScheduleChanges) {
                        this.queue.shift(); // good producer from previous block
                    }
                    this.storeSkippers({
                        skippers,
                        blockNum: blockNum - 1,
                        time: this.syncState.prevTime,
                    });
                    this.mustSync = false;
                } else {
                    this.fatality(`Unexpected sync: ${idx},${missed},${prevMissed},${q.length}`);
                    // don't return here, try to recover
                }
                this.syncState = {};
            }
        }
        if (this.mustSync) {
            this.init({ producer, schedule });
            return;
        }

        if (this.isSame({ schedule })) {
            // schedule didn't change from previous block, just get missed producers
            let pos = this.queue.indexOf(producer);
            if (pos >= 0) {
                const skippers = [];
                while (missed--) {
                    skippers.push(this.queue.shift());
                    pos--;
                    if (!this.queue.length || pos < 0) {
                        return this.fatality(pos < 0 ? 'Pos/queue unsync' : 'EOQ'); // resync
                    }
                }
                if (pos !== 0) {
                    return this.fatality(`Pos mismatch: ${pos}`); // resync
                }
                this.queue.shift();
                this.storeSkippers({ skippers, blockNum, time: prevTime });
            } else {
                // possible very rare case when next schedule is the same as previous one
                return this.fatality('Rare: same schedule');
            }
        } else {
            // here we have 2 cases: last producer in schedule or miss with schedule switch
            if (missed === 0) {
                // last producer with no miss
                this.schedule = schedule;
                const last = this.queue.shift();
                const l = this.queue.length;
                this.queue = [].concat(schedule);
                if (last !== producer) {
                    return this.fatality(`Unsynced last producer ${last} / ${producer}`);
                }
            } else {
                this.mustSync = true;
                this.syncState = {
                    queue: this.queue,
                    missed,
                    blockNum,
                    prevTime,
                };
                this.schedule = [].concat(schedule);
                this.queue = [].concat(schedule);
            }
        }
    }

    async storeSkippers({ skippers, blockNum, time }) {
        if (!skippers.length) return;
        Logger.info('Miss:', skippers.toString(), blockNum);
        const all = [];
        for (const producer of skippers) {
            time = new Date(time.getTime() + 3000);
            const miss = new MissedBlockModel({
                blockTime: time,
                blockNum,
                producer,
            });
            all.push(miss.save());
        }
        await Promise.all(all);
    }

    isSame({ schedule }) {
        return schedule.toString() === this.schedule.toString();
    }

    async _logFatal({ message, fatal }) {
        const log = new LogModel({
            blockNum: this.blockNum,
            text: message,
        });

        if (fatal) {
            Logger.warn('Schedule Fatality', log);
            this.mustSync = true;
        } else {
            Logger.info('Schedule', log);
        }

        await log.save();
    }

    async log(message) {
        await this._logFatal({ message, fatal: false });
    }

    async fatality(message) {
        await this._logFatal({ message, fatal: true });
    }
}

module.exports = Schedule;

