const path = require('path');
const htmlparser = require('htmlparser2');
const SingleEntryDependency = require('webpack/lib/dependencies/SingleEntryDependency');
const MultiEntryDependency = require('webpack/lib/dependencies/MultiEntryDependency');


function retrieveClasses(html) {
    const classes = new Set();
    const addEntity = classes.add.bind(classes);

    const parser = new htmlparser.Parser({
        onattribute(name, value) {
            if (name === 'class') {
                value.split(/\s/).forEach(addEntity);
            }
        }
    });

    parser.write(html);
    parser.end();

    return classes;
}


function getOrCreateSet(map, key, iterable) {
    let value = map.get(key);

    if (value === undefined) {
        value = iterable ? new Set(iterable) : new Set();
        map.set(key, value);
    }

    return value;
}


function iterateUntilPass(iterable, fn) {
    let err;
    let index = 0;

    for (const item of iterable) try {
        return fn(item, index++);
    } catch(e) { err = e; }

    throw err;
}


// итерируется по iterable, вызывая fn на каждом элементе
// возвращаемое значение вызова fn добавляется в результирующий массив
// те элементы, на которых fn выбрасывает ошибку, игнорируются
function sieve(iterable, fn) {
    const result = [];
    let index = 0;

    for (const item of iterable) try {
        result.push(fn(item, index++));
    } catch {};

    return result;
}


function stringToArray(arg) {
    return [].concat(arg).filter(Boolean);
}


function equalSet(as, bs) {
    if (as.size !== bs.size) return false;
    for (const a of as) if (!bs.has(a)) return false;
    return true;
}


function toRelativeRequest(context, filename) {
    const matchRelativePath = /^\.\.?\//;
    let request = path.relative(context, filename);

    if (!path.isAbsolute(request) && !matchRelativePath.test(request)) {
        request = './' + request;
    }

    return request;
}


function getEntryDependency(module) {
    for (const reason of module.reasons) {
        const dependency = reason.dependency;
        if (dependency instanceof SingleEntryDependency
            || dependency instanceof MultiEntryDependency) {
                return dependency;
            }
    }
}


function isIterable(obj) {
    if (obj == null) {
        return false;
    }
    return typeof obj[Symbol.iterator] === 'function';
}


module.exports = {
    retrieveClasses,
    getOrCreateSet,
    iterateUntilPass,
    sieve,
    stringToArray,
    equalSet,
    toRelativeRequest,
    getEntryDependency,
    isIterable
};