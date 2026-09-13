'use strict';

const fs = require('fs');
const path = require('path');

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

/* A widget's manifest is not a widget, so a change to it used to be ignored entirely.
   Everything the manifest carries is read when the widget is built: its title, the
   settings it declares, and the dependencies it needs. So a manifest that arrived after
   the widget, or was edited afterwards, changed nothing until the widget's own file
   moved or the app restarted.

   Two ways that showed: a folder copied in file by file could be read before its
   manifest landed, leaving the Widgets window showing the folder name where a title was
   declared; and editing a title or adding a setting by hand appeared to do nothing.

   The manifest sits beside the widget, so a change to it is reported as a change to the
   widget. Which file in the folder is the widget is a question the bundler already
   answers, so this names the folder and lets it resolve. */
const MANIFEST = 'widget.json';

function isManifest(filePath) {
  return (
    filePath.indexOf('/node_modules/') === -1 &&
    path.basename(filePath) === MANIFEST
  );
}

/* The widget a manifest belongs to: whichever entry file sits in the same folder. Only
   one of them can be the widget, since a folder widget is named after its folder. */
function widgetBesideManifest(manifestPath) {
  const folder = path.dirname(manifestPath);

  let entries;
  try {
    entries = fs.readdirSync(folder);
  } catch (err) {
    // the folder went away between the event and this read
    return undefined;
  }

  const entry = entries.find(
    (name) => /^index\.(jsx?|tsx?)$/.test(name)
  ) || entries.find((name) => /\.(jsx?|tsx?)$/.test(name));

  return entry ? path.join(folder, entry) : undefined;
}

module.exports = function resolveWidget(fileEvent) {
  let filePath = fileEvent.filePath;

  if (isManifest(filePath)) {
    const beside = widgetBesideManifest(filePath);
    if (!beside) return undefined;
    // a manifest that has just been written means the widget is there to rebuild
    return {
      id: widgetId(beside, fileEvent.rootPath),
      filePath: beside,
      type: 'added',
    };
  }

  if (!isWidgetPath(filePath)) {
    return undefined;
  }

  return {
    id: widgetId(filePath, fileEvent.rootPath),
    filePath: filePath,
    type: fileEvent.type,
  };
};
