'use strict';

const path = require('path');
const util = require('util');
const SingleEntryDependency = require('webpack/lib/dependencies/SingleEntryDependency');
const BemIntegratorPluginDependency = require('./lib/dependency');
const BemIntegratorStore = require('./lib/store');
const { stringToArray, processEntities, equalSet } = require('./lib/utils');
const VirtualFile = require('./lib/virtual-chunk');

const sharedStore = new BemIntegratorStore();
const PLUGIN_NAME = 'BemIntegratorPlugin';


class BemIntegratorPlugin {
    constructor(options) {
        this.options = options = Object.assign({}, options);

        this.options.include = options.include ? stringToArray(options.include) : true;
        this.options.exclude = options.exclude ? stringToArray(options.exclude) : false;

        this.options.scripts = stringToArray(options.scripts);
        this.options.levels = stringToArray(options.levels);
        this.options.techs = Array.from(new Set(stringToArray(options.techs).concat(this.options.scripts)));

        if (this.options.levels.length === 0) {
            throw new Error(`${PLUGIN_NAME}: "levels" option is required`);
        }
        
        if (this.options.techs.length === 0) {
            throw new Error(`${PLUGIN_NAME}: "techs" option is required`);
        }

        this.targets = new Map();
        this.preveTargetStates = new Map();
        this.virtualFiles = new Map();
        this.cachedModules = new WeakMap();
        this.childCompilationAssets = undefined;
        this.needAdditionalSeal = false;
    }

    apply(compiler) {

        compiler.hooks.afterEnvironment.tap(PLUGIN_NAME, () => {
            this.context = path.resolve(compiler.context);
            this.ifs = compiler.inputFileSystem;

            this.options.levels = this.options.levels.map(
                level => path.isAbsolute(level) ? level : path.join(this.context, level)
            );
        });


        const collectEntities = (compiler) => {
            compiler.hooks.thisCompilation.tap(PLUGIN_NAME, compilation => {
                compilation.hooks.finishModules.tap(PLUGIN_NAME, modules => {
                    for (const module of modules) {
                        const targets = sharedStore.get(module) || this.cachedModules.get(module);

                        if (targets) {
                            for (const [ target, _entities ] of targets) {
                                if (this.targets.has(target)) {
                                    const { entities } = this.targets.get(target);

                                    if (entities) {
                                        _entities.forEach(entities.add, entities);
                                    }
                                }
                            }

                            module.buildInfo.cacheable && this.cachedModules.set(module, targets);
                        }
                    }
                });

                compilation.hooks.childCompiler.tap(PLUGIN_NAME, childCompiler => {
                    collectEntities(childCompiler);
                });
            });
        };
        collectEntities(compiler);

        
        compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation, { contextModuleFactory, normalModuleFactory }) => {

            this.prepareNewCompilation(compilation);

            compilation.dependencyFactories.set(
                BemIntegratorPluginDependency,
                normalModuleFactory
            );

            compilation.dependencyTemplates.set(
                BemIntegratorPluginDependency,
                new BemIntegratorPluginDependency.Template()
            );

            // we need additional seal if any of target modules were rebuilt after sealing main compilation
            compilation.hooks.needAdditionalSeal.tap(PLUGIN_NAME, () => {
                return this.needAdditionalSeal ? true : undefined;
            });

            compilation.hooks.unseal.tap(PLUGIN_NAME, () => {
                this.needAdditionalSeal = false;
            });

            // "unseal" cleans up compilation.assets and every child compilation asset disappears
            // so save that assets before invoking createMoudleAssets of main compilation
            // and add them again after unsealing
            compilation.hooks.beforeModuleAssets.tap(PLUGIN_NAME, () => {
                if (!this.childCompilationAssets) {
                    return this.childCompilationAssets = compilation.getAssets();
                }

                for (const { name, source, info } of this.childCompilationAssets) {
                    compilation.emitAsset(name, source, info);
                }
            });

            compilation.hooks.buildModule.tap(PLUGIN_NAME, module => {
                for (const reason of module.reasons) {
                    const dependency = reason.dependency;

                    if (dependency instanceof SingleEntryDependency) {
                        const entry = dependency;
        
                        if (!this.targets.has(entry) && this.isTarget(entry)) {
                            const matchRelativePath = /^\.\.?\//;
                            const filename = path.resolve(this.context, this.generateFileName(entry));
                            const virtualFile = this.createVirtualFile(filename);

                            let request = path.relative(path.dirname(module.resource), filename);

                            if (!path.isAbsolute(request) && !matchRelativePath.test(request)) {
                                request = './' + request;
                            }

                            const bemDependency = this.createDependency(request);
                            module.addDependency(bemDependency);
                            this.targets.set(entry, { entities: new Set(), bemDependency, virtualFile });
                        }
                    }
                }
            });

            compilation.hooks.optimizeAssets.tapPromise(PLUGIN_NAME, async () => {
                const rebuildingModules = [];
                const rebuildModule = util.promisify(compilation.rebuildModule).bind(compilation);

                for (const [ entry, { entities, bemDependency, virtualFile } ] of this.targets) {
                    const prevState = this.preveTargetStates.get(entry);

                    if (entities.size && !(prevState && equalSet(prevState, entities))) {
                        const reqs = await this.retrieveFilenames(entities);
                        const content = this.generateContent(reqs);

                        if (!virtualFile.match(content)) {
                            virtualFile.setContent(content);
                            rebuildingModules.push(rebuildModule(bemDependency.module));
                        }
                    }

                    this.preveTargetStates.set(entry, new Set(entities));
                }

                rebuildingModules.length && (this.needAdditionalSeal = true);
                return Promise.all(rebuildingModules);
            });
        });
    }


    prepareNewCompilation(compilation) {
        sharedStore.clear();
        this.targets.forEach((target) => target.entities.clear());
        this.childCompilationAssets = undefined;
        this.needAdditionalSeal = false;
        this.mainCompilation = compilation;
    }


    findEntryTarget(target) {
        return Array.from(this.targets.keys()).find(entry =>
            ((typeof target === 'object' && target === entry) ||
            (typeof target === 'string' && target === entry.loc.name) ||
            (Array.isArray(target) && ~target.indexOf(entry.loc.name)))
        );
    }


    generateFileName(entry) {
        return `bem.module.${entry.loc.name}.js`
    }


    retrieveFilenames(entities) {
        return processEntities(entities, this.options.levels, this.options.techs);
    }


    generateContent(entities) {
        let code = ``;

        if (this.options.scripts.length) {
            code += 'var bemEntities = Object.create(null);\n\n';
        }

        for (const [entity, files] of entities) {
            for(const req of files) {
                if (~this.options.scripts.indexOf(path.extname(req).slice(1))) {
                    code += `var bemClass = require(${ JSON.stringify( './' + path.relative(this.context, req)) });\n\n`;
                    code += `if (bemClass && typeof(bemClass) === 'function') {\n`;
                    code += `  if (!bemEntities['${entity}']) {\n`;
                    code += `    bemEntities['${entity}'] = { constructor: bemClass, instances: [] };\n`
                    code += `  }\n\n`;
                    code += `  var instances = bemEntities['${entity}'].instances;\n`;
                    code += `  var elems = document.getElementsByClassName('${entity}');\n\n`;
                    code += `  for (var i = 0; i < elems.length; ++i) {\n`;
                    code += `    var elem = elems[i];\n`;
                    code += `    var entity = new bemClass(elem, '${entity}');\n\n`;
                    code += `    if (!elem.bemEntities) {\n`;
                    code += `      elem.bemEntities = Object.create(null);\n`;
                    code += `    }\n\n`
                    code += `    elem.bemEntities['${entity}'] = entity;\n`;
                    code += `    instances.push(entity);\n`;
                    code += `  }\n`;
                    code += `}\n\n`;
                } else {
                    code += `require(${ JSON.stringify( './' + path.relative(this.context, req) ) });\n`;
                }
            }
        }

        if (this.options.scripts.length) {
            code += `\n`;
            code += `for (var entityName in bemEntities) {\n`;
            code += `  bemEntities[entityName].instances.forEach(function(instance) {\n`;
            code += `    instance.init && instance.init();\n`;
            code += `  });\n`;
            code += `}\n\n`;

            code += 'window.bemEntities = bemEntities;\n';
        }

        return Buffer.from(code, 'utf8');
    }


    createVirtualFile(filename) {
        let virtualFile = this.virtualFiles.get(filename);

        if (!virtualFile) {
            virtualFile = new VirtualFile(this.context, filename, this.ifs);
            this.virtualFiles.set(filename, virtualFile);
        }

        return virtualFile;
    }


    createDependency(request) {
        const dep = new BemIntegratorPluginDependency(request);
        dep.loc = { start: { line: 0, column: 0 } };

        return dep;
    }


    isTarget(entry) {
        const name = entry.loc.name;
        
        const include = name => {
            return this.options.include === true || ~this.options.include.indexOf(name);
        };

        const exclude = name => {
            return !(this.options.exclude === false) && ~this.options.exclude.indexOf(name);
        };

        return (include(name) && !exclude(name));
    }
}


BemIntegratorPlugin.getInstance = function(loaderContext) {
    let rootCompiler = loaderContext._compiler;

    while(rootCompiler.isChild()) {
        rootCompiler = rootCompiler.parentCompilation.compiler;
    };

    if (!rootCompiler.options.plugins) return;

    const bemIntegratorPlugin = rootCompiler.options.plugins.find(
        plugin => plugin.constructor.name === 'BemIntegratorPlugin'
    );

    return bemIntegratorPlugin;
}

BemIntegratorPlugin.preHtmlLoader = path.resolve(__dirname, `lib/pre-html-loader`);
BemIntegratorPlugin.pugHtmlLoader = path.resolve(__dirname, `lib/pug-html-loader`);
BemIntegratorPlugin.sharedStore = sharedStore;

module.exports = BemIntegratorPlugin;