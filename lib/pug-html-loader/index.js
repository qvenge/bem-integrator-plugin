const loaderUtils = require('loader-utils');
const pug = require('pug');
const walk = require('pug-walk');
const path = require('path');
const defaultRuntimeWrap = require('pug-runtime/wrap');
const runtimeWrap = require('./wrap');
const { getEntityFiles} = require('../utils');
const BemIntegratorPlugin = require('../../index');


module.exports = function (source) {
    this.cacheable && this.cacheable();

    const bemIntegratorPlugin = BemIntegratorPlugin.getInstance(this);
    const loaderOptions = Object.assign({}, bemIntegratorPlugin.options, loaderUtils.getOptions(this));

    loaderOptions.resolve === false || (loaderOptions.resolve = true);
    loaderOptions.name || (loaderOptions.name = 'template');
    
    const dependencies = new Set();
    const definedMixins = new Set();

    const addTo = filename => {
        dependencies.add(filename);
    }

    const readFileSync = this._compiler.inputFileSystem.readFileSync.bind(this._compiler.inputFileSystem);

    const plugins = {
        read(filename, options) {
            addTo(filename);
            return readFileSync(filename).toString('utf8');
        },


        postLoad(ast, options) {
            return walk(ast, node => {
                if (node.file && node.file.ast) {
                    this.postLoad(node.file.ast, options);
                }
            }, (node, replace) => {
                if (node.type === 'Mixin') {
                    if (node.call && !definedMixins.has(node.name)) {
                        const entitiyName = node.name.replace(/([A-Z])/g, (_, ch) => `-${ch.toLowerCase()}`);

                        const files = getEntityFiles(entitiyName, loaderOptions.levels, ['pug'])
                            .map(entityPath => ({
                                entityPath,
                                source: readFileSync(entityPath).toString('utf8')
                            }));

                        const includeNodes = files.reduce((includes, { entityPath, source }, index) => {
                            if (dependencies.has(entityPath)) return;

                            const innerOptions = Object.assign({}, options);

                            innerOptions.filename = entityPath;
                            innerOptions.plugins = innerOptions.plugins.concat({
                                postLoad(ast) { throw { message: 'stop compilation', ast, entityPath, source }; }
                            });

                            addTo(entityPath);

                            try {
                                pug.compile(source, innerOptions);
                            } catch(err) {
                                if (err instanceof Error || err.message !== 'stop compilation') {
                                    throw err;
                                }

                                const { filename, line, column } = node;

                                includes.push({
                                    type: 'Include',
                                    file: {
                                        type: 'FileReference',
                                        filename: filename,
                                        path: path.relative(filename, entityPath),
                                        line: line + index,
                                        column: column + 8,
                                        fullPath: entityPath,
                                        str: source,
                                        ast: err.ast
                                    },
                                    line: line + index,
                                    column: column,
                                    filename: filename,
                                    block: {
                                        type: 'Block',
                                        nodes: [],
                                        line: line + index,
                                        filename: filename
                                    }
                                });
                            }

                            return includes;
                        }, []);

                        if (includeNodes.length) {
                            const nodeClone = Object.assign({}, node, { line: node.line + 1 });

                            replace(includeNodes.concat(nodeClone));

                            return false;
                        }
                    } else {
                        definedMixins.add(node.name);
                    }
                }
            });
        },
    }


    if (loaderOptions.resolve) {
        plugins.postLink = function(ast) {
            return walk(ast, node => {
                if (node.type === 'Tag') {
                    node.attrs.forEach(function(attr) {
                        if (attr.name === 'src') {
                            attr.val = `pug.resolve(${attr.val}, ${JSON.stringify(node.filename)}, ${node.line})`;
                        }
                    });
                }
            });
        };
    }

    const compiled = pug.compileClientWithDependenciesTracked(source, {
        filename: this.resourcePath,
        doctype: loaderOptions.doctype || 'html',
        basedir: loaderOptions.basedir,
        pretty: loaderOptions.pretty,
        self: loaderOptions.self,
        compileDebug: this.debug || false,
        globals: ['require'].concat(loaderOptions.globals || []),
        name: loaderOptions.name,
        inlineRuntimeFunctions: false,
        filters: loaderOptions.filters,
        plugins: loaderOptions.plugins ? [plugins].concat(loaderOptions.plugins) : [plugins]
    });

    const template = loaderOptions.resolve
        ? runtimeWrap(compiled.body, loaderOptions.name, this.context, loaderOptions.basedir)
        : defaultRuntimeWrap(compiled.body, loaderOptions.name);

    dependencies.forEach(this.addDependency, this);

    return template(loaderOptions.locals || {});
};