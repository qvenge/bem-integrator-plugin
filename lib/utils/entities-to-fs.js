const glob = require('glob');
const path = require('path');
const BemNaming = require('bem-naming');

const bemNaming = new BemNaming({
    elem: '__',
    mod: '_',
});


function buildSet(parts) {
    return parts.length > 1
        ? '{' + parts.join(',') + '}'
        : parts[0];
}


function lookup(pattern) {
    return new Promise((resolve, reject) => {
        glob(pattern, {noglobstar: true, nosort: true, realpath: true}, (err, files) => {
            if (err) return reject(err);
            resolve(files);
        });
    });
}


function resolveEntity(entityName) {
    const objEntity = bemNaming.parse(entityName);

    if (!objEntity) return;

    if (bemNaming.isElemMod(objEntity)) {
        return path.join(objEntity.block, bemNaming.elemDelim + objEntity.elem, bemNaming.modDelim + objEntity.modName, entityName);
    }
    
    if (bemNaming.isBlockMod(objEntity)) {
        return path.join(objEntity.block, bemNaming.modDelim + objEntity.modName, entityName);
    }
    
    if (bemNaming.isElem(objEntity)) {
        return path.join(objEntity.block, bemNaming.elemDelim + objEntity.elem, entityName);
    }
    
    if (bemNaming.isBlock(objEntity)) {
        return path.join(objEntity.block, objEntity.block);
    }
}


function getEntityFiles(entity, levels, techs) {
    const dirs = buildSet(levels);
    const exts = buildSet(techs);

    if (entity && bemNaming.validate(entity)) {
        const partialPattern = resolveEntity(entity);

        if (partialPattern) {
            const pattern = path.join(dirs, `${partialPattern}.${exts}`);
            return glob.sync(pattern, {noglobstar: true, nosort: true, realpath: true});
        }
    }

    return [];
}


function processEntities(entities, levels, techs) {
    const dirs = buildSet(levels);
    const exts = buildSet(techs);

    if (Array.isArray(entities)) entities = new Set(entities); 

    const promises = [];

    for (const entity of entities) {
        if (entity && bemNaming.validate(entity)) {
            const partialPattern = resolveEntity(entity);

            if (partialPattern) {
                const pattern = path.join(dirs, `${partialPattern}.${exts}`);
                const entityPromise = lookup(pattern).then(files => ([ entity, files ]));

                promises.push(entityPromise);
            }
        }
    }

    return Promise.all(promises).then(result => {
        result = result.filter(([,files]) => files.length);
        return new Map(result);
    });
}



function processEntitiesSync(entities, levels, techs) {
    const dirs = buildSet(levels);
    const exts = buildSet(techs);

    if (Array.isArray(entities)) entities = new Set(entities); 

    const result = new Map();

    for (const entity of entities) {
        if (entity && bemNaming.validate(entity)) {
            const partialPattern = resolveEntity(entity);

            if (partialPattern) {
                const pattern = path.join(dirs, `${partialPattern}.${exts}`);
                const files = glob.sync(pattern, {noglobstar: true, nosort: true, realpath: true});

                if (files.length) {
                    result.set(entity, new Set(files));
                }
            }
        }
    }

   return result;
}


module.exports = { processEntities, processEntitiesSync, getEntityFiles, resolveEntity };