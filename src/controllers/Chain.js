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

    async getValidators() {
        return await this._dataActualizer.getValidators()
    }
}

module.exports = Chain;
