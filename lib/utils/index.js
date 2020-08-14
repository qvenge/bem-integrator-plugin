const getUniqueId = require('./unique-id');
const entitiesToFs = require('./entities-to-fs');
const promisify = require('util').promisify;
const otherFuncs = require('./funcs');

module.exports = Object.assign(
    {
        promisify,
        getUniqueId
    },
    entitiesToFs,
    otherFuncs
);