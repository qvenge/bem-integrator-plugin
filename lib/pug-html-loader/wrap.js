const pugRuntime = require('pug-runtime');
const pathModule = require('path');


function resolveSrc(src, filename, line) {
    src = src.replace(/['"]|(^\.\/)/g, '');

    if (src[0] === '/' && !__basedir__) {
        var errorMessage = 'the "basedir" option is required to use "absolute" paths as "src" attribute value';
        errorMessage += '\n    at ' + filename + ' line ' + line;
        throw Error(errorMessage);
    }

    var context = src[0] === '/'
        ? __basedir__
        : __pathModule__.relative(__root__, __pathModule__.dirname(filename));
    
    return __pathModule__.join(context, src);
};


function wrap(template, templateName, root, basedir) {
    return Function('__root__', '__basedir__', '__pathModule__', 'pug', 
        'pug.resolve = ' + resolveSrc.toString() + '\n' + 
        template + '\n' + 
        'return ' + templateName + ';'
    )(root, basedir, pathModule, pugRuntime);
}

module.exports = wrap;