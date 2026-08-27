const browserify = require('browserify');
const watchify = require('./watchify');
const widgetify = require('./widgetify');
const coffeeify = require('coffeeify');
const babelify = require('babelify');
const jsxTransform = require('@babel/preset-react');
const tsTransform = require('@babel/preset-typescript');
const emotion = require('@emotion/babel-plugin');
const envPreset = require('@babel/preset-env');
const {Transform} = require('stream');

function wrapJSWidget() {
  let start = true;
  function write(chunk, enc, next) {
    if (start) {
      this.push('({');
      start = false;
    }
    next(null, chunk);
  }
  function flush(next) {
    this.push('})');
    next();
  }

  return new Transform({transform: write, flush: flush});
}

module.exports = function bundleWidget(id, filePath) {
  const isTsxWidget = filePath.match(/\.tsx$/);
  const isJsxWidget = filePath.match(/\.jsx$/) || isTsxWidget;
  const bundle = browserify(filePath, {
    detectGlobals: false,
    cache: {},
    packageCache: {},
    debug: isJsxWidget,
    extensions: ['.jsx', '.tsx', '.ts'],
  });

  bundle.plugin(watchify);
  bundle.require(filePath, {expose: id});
  bundle.external('gailan');
  bundle.external('uebersicht'); // legacy alias

  if (filePath.match(/\.coffee$/)) {
    bundle.transform(coffeeify, {
      bare: true,
      header: false,
    });
    bundle.transform(widgetify, {id: id});
  } else if (isJsxWidget) {
    const presets = [
      [envPreset, {targets: {safari: '16.6'}, modules: 'commonjs'}],
      [jsxTransform, {pragma: 'html'}],
    ];
    if (isTsxWidget) {
      // strips types only; nothing typechecks widgets
      presets.push([tsTransform, {isTSX: true, allExtensions: true}]);
    }
    bundle.transform(babelify, {
      extensions: ['.js', '.jsx', '.tsx', '.ts'],
      presets: presets,
      plugins: [emotion],
    });
  } else {
    bundle.transform(wrapJSWidget);
    bundle.transform(widgetify, {id: id});
  }
  return bundle;
};
