const pugRuntime = require('pug-runtime');
const pathModule = require('path');


function resolveSrcSet(srcset, filename, line) {
    srcset = srcset.replace(/['"]/g, '');

    function isAbsoluteUrl(url) {
        if (/^[a-zA-Z]:\\/.test(url)) {
            return false;
        }

        return /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(url);
    }

    srcset = srcset.split(',').map(function(setItem) {
        setItem = setItem.trim().split(/\s+/);
        var src = setItem[0].replace(/^\.\//, '');

        if (isAbsoluteUrl(src)) {
            return setItem.join(' ');
        }

        if (src[0] === '/' && !__basedir__) {
            var errorMessage = 'the "basedir" option is required to use "absolute" paths as "src" attribute value';
            errorMessage += '\n    at ' + filename + ' line ' + line;
            throw new Error(errorMessage);
        }
    
        var context = src[0] === '/'
            ? __basedir__
            : __pathModule__.relative(__root__, __pathModule__.dirname(filename));
        
        src = __pathModule__.join(context, src);

        return [src].concat(setItem.slice(1)).join(' ');
    });

    return srcset.join(', ');
};


function wrap(template, templateName, root, basedir) {
    return Function('__root__', '__basedir__', '__pathModule__', 'pug', 
        'pug.resolve = ' + resolveSrcSet.toString() + '\n' + 
        template + '\n' + 
        'return ' + templateName + ';'
    )(root, basedir, pathModule, pugRuntime);
}

module.exports = wrap;