const { retrieveClasses } = require('../utils');
const BemIntegratorPlugin = require('../../index');
const Module = require('webpack/lib/Module');
const SingleEntryDependency = require('webpack/lib/dependencies/SingleEntryDependency');


const findEntryDependency = (module) => {
    let rootModule = module;

    while (rootModule.issuer) {
        rootModule = rootModule.issuer;
    }

    for (const reason of rootModule.reasons) {
        if (reason.dependency instanceof SingleEntryDependency) {
            return reason.dependency;
        }
    }
};


module.exports = function (content) {
    if (this.cacheable) {
        this.cacheable(true);
    }

    const bemIntegratorPlugin = BemIntegratorPlugin.getInstance(this);
    const entities = retrieveClasses(content);

    let applicant = this._module;

    if (this._compiler.isChild() && /^(HtmlWebpackCompiler|html-webpack-plugin)/.test(this._compiler.name)) {
        const plugins = bemIntegratorPlugin.mainCompilation.compiler.options.plugins;
        
        const hwp = plugins.find(plugin => {
            if (plugin.constructor.name === 'HtmlWebpackPlugin') {
                const template = plugin.options.template.split(/!+/).pop();
                return template === this.resource;
            }
        });

        applicant = hwp.options.chunks && hwp.options.chunks !== 'all'
            ? hwp.options.chunks
            : bemIntegratorPlugin.mainCompilation.entries[0];
    }

    if (applicant instanceof Module) {
        applicant = findEntryDependency(applicant);
    }

    const target = bemIntegratorPlugin.findEntryTarget(applicant);

    if (!target) {
        throw new Error(`${BemIntegratorPlugin.name}: didn't manage to find target for ${this.resource}`);
    }

    BemIntegratorPlugin.sharedStore.add(this._module, entities, target);

    return content;
};