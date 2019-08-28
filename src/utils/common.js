function extractByPath(data, path) {
    const [field, ...rest] = path;
    const value = data[field];

    if (value === null || value === undefined) {
        return [];
    }

    if (Array.isArray(value)) {
        if (rest.length) {
            const values = [];

            for (const v of value) {
                values.push(...extractByPath(v, rest));
            }

            return values;
        } else {
            return value;
        }
    } else {
        if (rest.length) {
            return extractByPath(value, rest);
        } else {
            return [value];
        }
    }
}

module.exports = {
    extractByPath,
};
