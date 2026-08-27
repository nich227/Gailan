'use strict';

const bundleWidget = require('./esbuildWidget');
const fs = require('fs');

module.exports = function WidgetBundler() {
  const api = {};
  const bundles = {};

  api.push = function push(action, callback) {
    if (action && action.type) {
      action.type === 'added'
        ? addWidget(action.id, action.filePath, callback)
        : removeWidget(action.id, action.filePath, callback)
        ;
    }
  };

  api.close = function close() {
    for (var id in bundles) {
      bundles[id].close();
      delete bundles[id];
    }
  };

  api.get = function get(id) {
    return bundles[id].widget.body;
  };

  function addWidget(id, filePath, emit) {
    if (!bundles[id]) {
      bundles[id] = WidgetBundle(id, filePath, (widget) => {
        emit({type: 'added', widget: widget});
      });
    }
  }

  function removeWidget(id, filePath, emit) {
    if (bundles[id]) {
      bundles[id].close();
      delete bundles[id];
      emit({type: 'removed', id: id});
    }
  }

  function WidgetBundle(id, filePath, callback) {
    const bundle = bundleWidget(id, filePath);
    let closed = false;

    // once a widget is gone, nothing it has in flight should still report
    const closeBundle = bundle.close;
    bundle.close = () => {
      closed = true;
      closeBundle();
    };

    const buildWidget = (paths = []) => {
      if (closed) return;

      const widget = {
        id: id,
        filePath: filePath,
      };

      fs.access(filePath, fs.constants.R_OK, (couldNotRead) => {
        if (couldNotRead || closed) return;
        bundle.bundle((err, srcBuffer) => {
          if (closed) return;
          if (err) {
            widget.error = errorJSON(filePath, err);
          } else {
            widget.body = srcBuffer.toString();
          }

          fs.stat(paths[0] || filePath, (statErr, stat) => {
            // the file can be deleted between bundling and this stat. throwing
            // here used to take the whole server down with it.
            if (statErr || closed) return;
            widget.mtime = stat.mtime;
            bundle.widget = widget;
            callback(widget);
          });
        });
      });
    };

    bundle.on('update', buildWidget);
    buildWidget();
    return bundle;
  }

  function errorJSON(filePath, error) {
    if (!error._babel) {
      return JSON.stringify({
        line: error.line,
        column: error.column,
        path: filePath,
        lines: error.annotated,
        message: error.message,
      });
    }
    return JSON.stringify({
      line: error.loc.line,
      column: error.loc.column,
      lines: parseCodeFrame(error.codeFrame),
      path: filePath,
      message: error.message,
    });
  }

  function parseCodeFrame(codeFrame) {
    return codeFrame
      .split('\n')
      .map(l => {
        const [num, line] = l.split('|', 2);
        const lineNum = parseInt(num.replace(/^>/, ''), 10);
        return isNaN(lineNum) ? undefined : {lineNum: lineNum, line: line};
      })
      .filter(i => i);
  }

  return api;
};
