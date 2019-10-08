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

async function saveModelIgnoringDups(model, errName) {
    try {
        await model.save();
    } catch (err) {
        if (errName === undefined) {
            errName = 'MongoError';
        }
        if (!(err.name === errName && err.code === 11000)) {
            throw err;
        }
    }
}

// use 2-digits Year and Month (starts from 0) as id (e.g. "1909" for October 2019)
function dateToBucketId(date) {
    return `${(date.getYear() - 100) * 100 + date.getMonth()}`;
}

function arrayToDict({ array, key, singleValue }) {
    const result = {};

    for (const item of array) {
        const k = item[key];
        delete item[key];
        result[k] = singleValue === undefined ? item : item[singleValue];
    }

    return result;
}

module.exports = {
    extractByPath,
    saveModelIgnoringDups,
    dateToBucketId,
    arrayToDict,
};
