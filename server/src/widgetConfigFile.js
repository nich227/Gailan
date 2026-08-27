//
//  widgetConfigFile.js
//  Gailan
//
//  Copyright (c) 2026 Kevin Chen.
//
//  Released under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  (at your option) any later version. See <http://www.gnu.org/licenses/> for
//  details.
//
'use strict';

// What the user chose for a widget is written beside the widget, as settings.json
// in its own folder. That way the settings travel with the widget: copy the
// folder to another Mac and it looks the same.
//
// The file is not a widget, so the watcher ignores it and writing one cannot
// start a rebuild loop.

const fs = require('fs');
const path = require('path');

const FILE = 'settings.json';

function fileFor(widgetPath) {
  return path.join(path.dirname(widgetPath), FILE);
}

exports.read = function read(widgetPath) {
  try {
    const raw = JSON.parse(fs.readFileSync(fileFor(widgetPath), 'utf8'));
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch (err) {
    // no file yet, or one that is not JSON: nothing was saved
    return {};
  }
};

// Only writes when something actually changed, because the watcher sees every
// write and the store notifies on every action.
exports.write = function write(widgetPath, config) {
  const file = fileFor(widgetPath);
  const next = JSON.stringify(config || {}, null, 2) + '\n';

  try {
    if (fs.readFileSync(file, 'utf8') === next) return false;
  } catch (err) {
    // not there yet, so it needs writing
  }

  try {
    fs.writeFileSync(file, next);
    return true;
  } catch (err) {
    console.log(`could not save settings for ${widgetPath}:`, err.message);
    return false;
  }
};
