const loaderUtils = require('loader-utils');
const pug = require('pug');
const walk = require('pug-walk');
const path = require('path');
const defaultRuntimeWrap = require('pug-runtime/wrap');
const resolveRuntimeWrap = require('./wrap');
const { getEntityFiles} = require('../utils');
const BemIntegratorPlugin = require('../../index');


module.exports = function (source) {
    this.cacheable && this.cacheable();

    const bemIntegratorPlugin = BemIntegratorPlugin.getInstance(this);
    const loaderOptions = Object.assign({}, bemIntegratorPlugin.options, loaderUtils.getOptions(this));

    loaderOptions.resolve = loaderOptions.resolve === true;
    loaderOptions.name || (loaderOptions.name = 'template');
    
    const dependencies = new Set();
    const definedMixins = new Set();
    const includeNodes = [];

    const readFileSync = this._compiler.inputFileSystem.readFileSync.bind(this._compiler.inputFileSystem);
    const runtimeWrap = loaderOptions.resolve ? resolveRuntimeWrap : defaultRuntimeWrap;

    const plugin = {
        read(filename, options) {
            dependencies.add(filename);
            return readFileSync(filename).toString('utf8');
        },

        postLoad(ast, options) {
            const processAst = (ast, options) => {
                return walk(ast, node => {
                    if (node.file && node.file.ast) {
                        processAst(node.file.ast, options);
                    }
                }, node => {
                    if (node.type === 'Mixin') {
                        if (node.call && !definedMixins.has(node.name)) {
                            const entitiyName = node.name.replace(/([A-Z])/g, (_, ch) => `-${ch.toLowerCase()}`);

                            const files = getEntityFiles(entitiyName, loaderOptions.levels, ['pug']);

                            files.forEach((entityPath, index) => {
                                if (dependencies.has(entityPath)) return;

                                dependencies.add(entityPath);

                                const source = readFileSync(entityPath).toString('utf8');

                                const innerOptions = Object.assign({}, options);
                                innerOptions.filename = entityPath;
                                innerOptions.plugins = options.plugins.slice()
                                innerOptions.plugins.push(
                                    { postLoad(ast) { throw { message: 'stop compilation', ast }; }
                                });

                                try {
                                    pug.compile(source, innerOptions);
                                } catch(err) {
                                    if (err instanceof Error || err.message !== 'stop compilation') {
                                        throw err;
                                    }

                                    const { filename, line, column } = node;

                                    includeNodes.push({
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
                            });
                        } else {
                            definedMixins.add(node.name);
                        }
                    }
                });
            }

            return processAst(ast, options);
        },

        preFilters(ast, options) {
            if (ast.nodes[0].type === 'Extends') {
                ast.nodes = [ast.nodes[0]].concat(includeNodes, ast.nodes.slice(1));
            } else {
                ast.nodes = includeNodes.concat(ast.nodes);
            }
            return ast;
        }
    }


    if (loaderOptions.resolve) {
        plugin.postLink = function(ast, options) {
            return walk(ast, node => {
                if (node.type === 'Tag') {
                    node.attrs.forEach(function(attr) {
                        if (attr.name === 'src' || attr.name === 'srcset') {
                            const resolveOptions = JSON.stringify({
                                root: path.dirname(options.filename),
                                basedir: options.basedir,
                                filename: node.filename,
                                line: node.line
                            });

                            attr.val = `__resolve__(${attr.val}, ${resolveOptions})`;
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
        plugins: loaderOptions.plugins ? [plugin].concat(loaderOptions.plugins) : [plugin]
    });

    const template = runtimeWrap(compiled.body, loaderOptions.name);

    dependencies.forEach(this.addDependency, this);

    return template(loaderOptions.locals || {});
};