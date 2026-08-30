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
const DEFAULTS_FILE = 'settings.default.json';

function fileFor(widgetPath) {
  return path.join(path.dirname(widgetPath), FILE);
}

function defaultsFileFor(widgetPath) {
  return path.join(path.dirname(widgetPath), DEFAULTS_FILE);
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

/* What a widget falls back to, beside it as settings.default.json. The manifest
   already carries a default per setting; this file is where those land so they can
   be read and changed without editing the widget, and it is what Reset goes back
   to. */
exports.readDefaults = function readDefaults(widgetPath) {
  try {
    const raw = JSON.parse(fs.readFileSync(defaultsFileFor(widgetPath), 'utf8'));
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch (err) {
    // no file yet, or one that is not JSON: the manifest's own defaults stand
    return {};
  }
};

/* Written once and then left alone, so an edit made here survives every launch.
   Overwriting it would make the file look editable while quietly discarding what
   anybody put in it. */
exports.writeDefaults = function writeDefaults(widgetPath, defaults) {
  const file = defaultsFileFor(widgetPath);
  if (!defaults || !Object.keys(defaults).length) return false;
  if (fs.existsSync(file)) return false;

  try {
    fs.writeFileSync(file, JSON.stringify(defaults, null, 2) + '\n');
    return true;
  } catch (err) {
    console.log(`could not save defaults for ${widgetPath}:`, err.message);
    return false;
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
