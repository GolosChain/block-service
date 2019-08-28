const { flatMap } = require('lodash');

function extractByPath(data, path) {
    const [field, ...rest] = path;
    const value = data[field];

    if (value === null || value === undefined) {
        return [];
    }

    if (Array.isArray(value)) {
        if (rest.length) {
            return flatMap(value, v => extractByPath(v, rest));
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
