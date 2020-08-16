const { retrieveClasses, getEntryDependency } = require('../utils');
const BemIntegratorPlugin = require('../../index');


const findEntryName = (module) => {
    while (module.issuer) {
        module = module.issuer;
    }
    const dependency = getEntryDependency(module);
    return dependency.name || dependency.loc.name;
};


module.exports = function (content) {
    if (this.cacheable) {
        this.cacheable(true);
    }

    const bemIntegratorPlugin = BemIntegratorPlugin.getInstance(this);
    const entities = retrieveClasses(content);
    let target;

    if (!this._compiler.isChild()) {
        target = findEntryName(this._module);
    } else if (/^(HtmlWebpackCompiler|html-webpack-plugin)/.test(this._compiler.name)) {
        const plugins = bemIntegratorPlugin.mainCompilation.compiler.options.plugins;
        
        const hwp = plugins.find(plugin => {
            if (plugin.constructor.name === 'HtmlWebpackPlugin') {
                const template = plugin.options.template.split(/!+/).pop();
                return template === this.resource;
            }
        });

        const verifyTarget = (name) => {
            return (hwp.options.excludeChunks.indexOf(name) === -1
                && bemIntegratorPlugin.verifyTarget(name));
        };

        const targetName = bemIntegratorPlugin.options.hwpOptions && bemIntegratorPlugin.options.hwpOptions.targetName;

        if (typeof targetName === 'string') {
            target = targetName;
        }
        else if (typeof targetName === 'function') {
            target = targetName(hwp);
        }
        else if (hwp.options.chunks === 'all') {
            for (const entryModule of bemIntegratorPlugin.mainCompilation.entries) {
                const entryName = findEntryName(entryModule);
                
                if (verifyTarget(entryName)) {
                    target = entryName;
                    break;
                }
            }
        }
        else if (Array.isArray(hwp.options.chunks)) {
            const chunks = hwp.options.chunks.filter(chunk => verifyTarget(chunk));

            if (chunks.length > 1) {
                throw new Error(
                    BemIntegratorPlugin.name + ': ' +
                    'if more than one chunk is specified in "chunks" option of HtmlWebpackPlugin,' +
                    'then hwpOptions.targetName option of BemIntegratorPlugin must be specified as well'
                );
            }

            if (chunks.length) target = chunks[0];
        }
        else if (typeof hwp.options.chunks === 'string') {
            target = hwp.options.chunks;
        } 
    }

    if (typeof target === 'string') {
        BemIntegratorPlugin.sharedStore.add(this._module, entities, target);
    }

    return content;
};