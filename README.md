# bem-integrator-plugin

Plugin to automate BEM dependency inclusions.

## Installation

`npm install --save-dev bem-integrator-plugin`

## Loaders

### preHtmlLoader (required)

This loader analyses html and extracts BEM entities. preHtmLoader is required.


### pugHtmlLoader

The same as usual pug-html-loader, but if there is a mixin invocation before its definition in the pug file, then this loader tries to find and include the corresponding pug file. For example: mixin `someBlock` corresponds to `redefinition.level/some-block/some-block.pug` file. That file should contain the `someBlock` mixin definition, otherwise an error will occur. Besides, it resolves the src and scrset attribute values in the included files relative to their directories.

## Options

### `levels (required)`

Type: `String|Array<string>`.

Defines the list of redefinition levels. About redefinition levels: https://en.bem.info/methodology/redefinition-levels.

### `techs (required)`

Type: `String|Array<string>`

Defines the list of file extensions of files to include in the project. For example: `techs: ['scss', 'css', 'js']`.

### `scripts`

Type: `String|Array<string>`.

Almost the same as the `techs` option, but files with that extensions are supposed to export an entity class.

For each exported class, the plugin inserts runtime code into the project that finds corresponding DOM elements on the page and creates an instance of the class for each DOM element passing that element to the constructor as an argument.

If the `postInit` method is defined on an entity class then it will be invoked after each such entity class has been processed and each instance created. The `postInit` is called asynchronously in order not to block the main thread between calls.

### `include`

Type: `Boolean|String|Array<string>`. Default: `true` (include all entry points).

Defines the list of entry to consider.

### `exclude`

Type: `Boolean|String|Array<string>`. Default: `false` (don't exclude eny entry points).

Defines the list of entry excluded from consideration.

### `hwpOptions`

Type: `Object`.

Defines options for htmlWebpackPugin.

#### `hwpOptions.targetName`

Type: `String|Function`.

Defines the entry point to which all BEM dependencies from the template will be added. If the `chunks` option of the HtmlWebpackPlugin is specified and it contains more than one chunk, then the `hwpOptions.targetName` option must be specified.

When `hwpOptions.targetName` is a function, the corresponding HtmlWebpackPlugin instance will be passed as an argument.

## Usage example with HtmlWebpackPlugin and Pug

file structure:
```
src/
  common.blocks/
    some-block/
      some-block.pug
      some-block.css
      some-block.js
      pic.jpg
  index.pug
```

***webpack.config.js***
```js
const BemIntegratorPlugin = require('bem-integrator-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');


module.exports = {
  module: {
    rules: [
      {
        test: /\.pug$/i,
        use: [
          'html-loader',
          BemIntegratorPlugin.preHtmlLoader,
          BemIntegratorPlugin.pugHtmlLoader,
        ],
      },
      {
        test: /\.css$/i,
        use: [
          'style-loader', 
          'css-loader',
        ],
      },
      {
        test: /\.(png|svg|jpg|gif)$/,
        use: [
          'file-loader',
        ],
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/index.pug',
      filename: 'index.html'
    }),
    new BemIntegratorPlugin({
      levels: './src/common.blocks',
      techs: ['css'],
      scripts: ['js']
    })
  ]
};
```

***src/index.pug***
```pug
<!DOCTYPE html>
html(lang="en")
  head
    meta(charset="UTF-8")
    meta(name="viewport", content="width=device-width, initial-scale=1.0")
    title Document
  body
    +someBlock
```

***src/common.blocks/some-block/some-block.pug***
```pug
mixin someBlock()
  //- src value will be resolved correctly
  img(src="pic.jpg" class="some-block")
```

***src/common.blocks/some-block/some-block.js***
```js
class SomeBlock {
  constructor(elem) {
    this.elem = elem;
  }
  
  postInit() {
    this.elem.addEventListener('click', (e) => {
      alert('Hi!');
    });
  }
}
  
module.exports = SomeBlock;
```

***src/common.blocks/some-block/some-block.css***
```css
.some-block {
  width: 48px;
  height: 48px;
  cursor: pointer;
}
```
