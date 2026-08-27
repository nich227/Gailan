'use strict';

function isWidgetPath(filePath) {
  return (
    filePath.indexOf('/node_modules/') === -1 &&
    filePath.indexOf('/src/') === -1 &&
    filePath.indexOf('/lib/') === -1 &&
    /\.js$|\.jsx$|\.ts$|\.tsx$/.test(filePath)
  );
}

// The id is the path inside the widget folder without the extension, so
// GettingStarted.tsx is "GettingStarted". A widget kept in its own folder is
// named after the folder: clock/index.tsx is "clock", not "clock-index".
function widgetId(filePath, rootPath) {
  const fileParts = filePath
    .replace(rootPath, '')
    .replace(/\.(jsx?|tsx?)$/, '')
    .split(/\/+/)
    .filter((part) => !!part);

  if (fileParts.length > 1 && fileParts[fileParts.length - 1] === 'index') {
    fileParts.pop();
  }

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
