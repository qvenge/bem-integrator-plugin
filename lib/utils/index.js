const getUniqueId = require('./unique-id');
const entitiesToFs = require('./entities-to-fs');
const otherFuncs = require('./funcs');

module.exports = Object.assign(
    {
        getUniqueId
    },
    entitiesToFs,
    otherFuncs
);