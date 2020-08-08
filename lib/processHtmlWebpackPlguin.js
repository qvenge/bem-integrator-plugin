const SingleEntryPlugin = require('webpack/lib/SingleEntryPlugin');
const HtmlWebpackPlugin = require('safe-require')('html-webpack-plugin');
const { getUniqueId } = require('./utils');


function processHtmlWebpackPlugin(compiler, bemIntegratorPlugin) {
    if (!HtmlWebpackPlugin) return;

    const PLUGIN_NAME = bemIntegratorPlugin.constructor.name;
    const options = bemIntegratorPlugin.options.hwpOptions || {};

    const entries = new Map();
    const targets = new Map();

    compiler.hooks.afterEnvironment.tap(PLUGIN_NAME, () => {
        if (options.newEntry) {
            let targetName = options.targetName;

            if (!targetName) {
                targetName = (hwp) => (entries.get(hwp) || getUniqueId());
                bemIntegratorPlugin.options.hwpOption.targetName = targetName;
            }

            compiler.options.plugins.forEach(plugin => {
                if (plugin instanceof HtmlWebpackPlugin) {
                    const name = typeof targetName === 'string' ? targetName : targetName(plugin);
                    const filename = path.resolve(bemIntegratorPlugin.context, `bem.entry.${name}.js`);
                    const request = utils.toRelativeRequest(bemIntegratorPlugin.context, filename);

                    entries.set(plugin, name);
                    bemIntegratorPlugin.createVirtualFile(filename);
                    (new SingleEntryPlugin(bemIntegratorPlugin.context, request, name)).apply(compiler);
                }
            });
        }
    });

    compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation) => {
        HtmlWebpackPlugin.getHooks(compilation).beforeAssetTagGeneration.tap(PLUGIN_NAME, ({ assets, plugin }) => {
            const name = entries.get(plugin);

            if (name && plugin.options.exclueChunks.indexOf(name) === -1) {
                assets.js.push(name);
            }
        });

        compilation.hooks.childCompiler.tap(PLUGIN_NAME, (compiler) => {
            if (/^(HtmlWebpackCompiler|html-webpack-plugin)/.test(compiler.name)) {
                targets.clear();

                compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation) => {
                    compilation.hooks.finishModules.tap(PLUGIN_NAME, modules => {
                        for (const module of modules) {
                            bemIntegratorPlugin.processModuleEntities(module, targets);
                        }
                    });
                });
            }
        });
    });

    return targets;
}


module.exports = processHtmlWebpackPlugin;