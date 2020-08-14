const Module = require('webpack/lib/Module');
const SingleEntryDependency = require('webpack/lib/dependencies/SingleEntryDependency');


class BemIntegratorStore {
    constructor() {
        this._store = new Map();
    }

    get(origin) {
        return this._store.get(origin);
    }

    add(origin, entities, target) {
        if (!(origin instanceof Module)) {
            throw new Error(`${PLUGIN_NAME}: the first argument (origin) of add of BemIntegratorStore must be an instance of Module`);
        }

        if (!entities[Symbol.iterator]) {
            throw new Error(`${PLUGIN_NAME}: the second argument (entities) of add of BemIntegratorStore must be iterable`);
        }

        if (typeof target !== 'string') {
            throw new Error(`${PLUGIN_NAME}: the third argument (target) of add of BemIntegratorStore must be string`);
        }

        const targets = this._store.get(origin);

        if (!targets) {
            return this._store.set(origin, new Map([ [target, new Set(entities)] ]));
        }

        const ents = targets.get(target);

        if (ents) {
            entities.forEach(ents.add, ents);
        } else {
            targets.set(target, new Set(entities));
        }
    }
    
    clear() {
        this._store.clear();
    }


    [Symbol.iterator]() {
        return this._store[Symbol.iterator]();
    }
}

module.exports = BemIntegratorStore;