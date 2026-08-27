'use strict';

function isWidgetPath(filePath) {
  return (
    filePath.indexOf('/node_modules/') === -1 &&
    filePath.indexOf('/src/') === -1 &&
    filePath.indexOf('/lib/') === -1 &&
    /\.js$|\.jsx$|\.ts$|\.tsx$/.test(filePath)
  );
}

// The id is the path inside the widget folder, without the extension: a widget
// called GettingStarted.tsx is "GettingStarted", not "GettingStarted-tsx". A
// folder widget keeps its folder in the name, so widgets/clock/index.tsx is
// "clock-index".
function widgetId(filePath, rootPath) {
  const fileParts = filePath
    .replace(rootPath, '')
    .replace(/\.(jsx?|tsx?)$/, '')
    .split(/\/+/)
    .filter((part) => !!part);

  return fileParts
    .join('-')
    .replace(/\./g, '-')
    .replace(/\s/g, '_');
}

module.exports = function resolveWidget(fileEvent) {
  if (!isWidgetPath(fileEvent.filePath)) {
    return undefined;
  }

  return {
    id: widgetId(fileEvent.filePath, fileEvent.rootPath),
    filePath: fileEvent.filePath,
    type: fileEvent.type,
  };
};
