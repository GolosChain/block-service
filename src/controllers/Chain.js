class Chain {
    constructor({ dataActualizer }) {
        this._dataActualizer = dataActualizer;
    }

    async getProducers() {
        const { producers, updateTime } = this._dataActualizer.getProducers();

        return {
            items: producers,
            updateTime: updateTime,
        };
    }
}

module.exports = Chain;
