const pugRuntime = require('pug-runtime');
const pathModule = require('path');


function resolveSrcSet(srcset, options/* root, basedir, filename, srcset, line */) {
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

        if (src[0] === '~') {
            return setItem.join(' ').slice(1);
        }

        if (isAbsoluteUrl(src)) {
            return setItem.join(' ');
        }

        if (src[0] === '/' && !options.basedir) {
            var errorMessage = 'the "basedir" option is required to use "absolute" paths as "src" attribute value';
            errorMessage += '\n    at ' + options.filename + ' line ' + options.line;
            throw new Error(errorMessage);
        }
    
        var context = src[0] === '/'
            ? options.basedir
            : __pathModule__.relative(options.root, __pathModule__.dirname(options.filename));
        
        src = __pathModule__.join(context, src);

        return [src].concat(setItem.slice(1)).join(' ');
    });

    return srcset.join(', ');
};


function wrap(template, templateName) {
    return Function('pug', '__pathModule__', 
        '__resolve__ = ' + resolveSrcSet.toString() + '\n' + 
        template + '\n' + 
        'return ' + templateName + ';'
    )(pugRuntime, pathModule);
}

module.exports = wrap;