'use strict';
const ModuleDependency = require('webpack/lib/dependencies/ModuleDependency');

class BemIntegratorPluginDependency extends ModuleDependency {
	constructor(request) {
		super(request);
	}
	get type() {
		return 'integrated asset';
	}
}

BemIntegratorPluginDependency.Template = class BemWebpackPluginTemplate {
	apply(dep, source, runtime) {
		const id = runtime.moduleId({
			module: dep.module,
			request: dep.request
        });
		source.insert(0, `__webpack_require__(${id})\n`);
	}
}

module.exports = BemIntegratorPluginDependency;