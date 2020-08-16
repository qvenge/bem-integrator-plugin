'use strict';

const path = require('path');
const utils = require('./lib/utils');
const BemIntegratorPluginDependency = require('./lib/dependency');
const BemIntegratorStore = require('./lib/store');
const VirtualFile = require('./lib/virtual-chunk');
const processHtmlWebpackPlugin = require('./lib/processHtmlWebpackPlguin');

const sharedStore = new BemIntegratorStore();
const PLUGIN_NAME = 'BemIntegratorPlugin';


class BemIntegratorPlugin {
    constructor(options) {
        this.options = options = Object.assign({}, options);

        options.include = options.include ? utils.stringToArray(options.include) : true;
        options.exclude = options.exclude ? utils.stringToArray(options.exclude) : false;
        options.hwpOptions = options.hwpOptions || {};
        options.scripts = utils.stringToArray(options.scripts);
        options.levels = utils.stringToArray(options.levels);
        options.techs = Array.from(new Set(utils.stringToArray(options.techs).concat(options.scripts)));
        options.plugins = utils.isIterable(options.plugins) ? [...options.plugins] : [];

        if (options.levels.length === 0) {
            throw new Error(`${PLUGIN_NAME}: "levels" option is required`);
        }
        
        if (options.techs.length === 0) {
            throw new Error(`${PLUGIN_NAME}: "techs" option is required`);
        }

        this.targets = new Map();
        this.pluginTargets = [];
        this.virtualFiles = new Map();
        this.cachedOrigins = new WeakMap();
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


        this.applyPlugins(compiler);

        
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
                if (!module.issuer && ~compilation.entries.indexOf(module)) {
                    const entryDependency = utils.getEntryDependency(module);
                    const name = entryDependency.name || entryDependency.loc.name;

                    if (this.verifyTarget(name)) {
                        const filename = path.join(this.context, `bem.module.${name}.js`);
                        const context = module.resource ? path.dirname(module.resource) : this.context;
                        const request = utils.toRelativeRequest(context, filename);

                        const bemDependency = this.createDependency(request);
                        bemDependency.targetName = name;
                        bemDependency.filename = filename;

                        this.createVirtualFile(filename);
                        module.dependencies.unshift(bemDependency);
                    }
                }
            });


            compilation.hooks.finishModules.tap(PLUGIN_NAME, modules => {
                for (const module of modules) {
                    this.processModuleEntities(module, this.targets);
                }
            });


            compilation.hooks.optimizeAssets.tapPromise(PLUGIN_NAME, async () => {
                const rebuildingModules = [];
                const rebuildModule = utils.promisify(compilation.rebuildModule).bind(compilation);

                for (const entryModule of compilation.entries) {
                    const bemDependency = entryModule.dependencies.find(dep => dep instanceof BemIntegratorPluginDependency);

                    if (bemDependency) {
                        const { targetName, filename } = bemDependency;
                        const entities = this.mergeAllEntities(targetName);
                        const reqs = await this.retrieveFilenames(entities);
                        const content = this.generateContent(reqs);
                        const virtualFile = this.virtualFiles.get(filename);

                        if (!virtualFile.match(content)) {
                            virtualFile.setContent(content);
                            rebuildingModules.push(rebuildModule(bemDependency.module));
                        }
                    }
                }

                if (rebuildingModules.length) {
                    this.needAdditionalSeal = true;
                }

                return Promise.all(rebuildingModules);
            });
        });
    }


    prepareNewCompilation(compilation) {
        sharedStore.clear();
        this.targets.clear();
        this.childCompilationAssets = undefined;
        this.needAdditionalSeal = false;
        this.mainCompilation = compilation;
    }


    applyPlugins(compiler) {
        const plugins = [processHtmlWebpackPlugin].concat(this.options.plugins);

        for (const plugin of plugins) {
            const targets = plugin(compiler, this);

            if (utils.isIterable(targets)) {
                this.pluginTargets.push(targets);
            }
        }
    }


    retrieveFilenames(entities) {
        return utils.processEntities(entities, this.options.levels, this.options.techs);
    }


    mergeAllEntities(target) {
        const result = new Set();
        const allTargets = [...this.pluginTargets, this.targets];

        for (const targets of allTargets) {
            const entities = targets.get(target);
            
            if (entities) {
                entities.forEach(result.add, result);
            }
        }

        return result;
    }


    processModuleEntities(module, targets) {
        const moduleTargets = sharedStore.get(module) || this.cachedOrigins.get(module);

        if (moduleTargets) {
            for (const [ target, moduleEntities ] of moduleTargets) {
                const entities = targets.get(target);

                if (entities) {
                    moduleEntities.forEach(entities.add, entities);
                } else {
                    targets.set(target, new Set(moduleEntities));
                }                                  
            }

            module.buildInfo.cacheable && this.cachedOrigins.set(module, moduleTargets);
        }
    }


    generateContent(entities) {
        let code = ``;

        if (this.options.scripts.length) {
            code += 'var bemEntities = window.bemEntities = Object.create(null);\n\n';
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
            code += `    if (instance.postInit) {\n`;
            code += `      setTimeout(instance.postInit.bind(instance), 0);\n`;
            code += `    }\n`;
            code += `  });\n`;
            code += `}\n\n`;
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


    verifyTarget(name) {        
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