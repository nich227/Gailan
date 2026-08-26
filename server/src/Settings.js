'use strict';

const path = require('path');
const fs = require('fs');

module.exports = function Settings(settingsDirPath) {
  const api = {};
  let settings;
  let queued;
  let writing = false;
  const settingsFile = path.join(settingsDirPath, 'WidgetSettings.json');

  initSettingsFile(settingsDirPath);

  function initSettingsFile(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath);
    }
  }

  api.load = function load() {
    let persistedSettings = {};
    try {
      persistedSettings = require(settingsFile);
    } catch (e) { /* do nothing */ }

    return persistedSettings;
  };

  function write(newSettings) {
    writing = true;
    fs.writeFile(settingsFile, JSON.stringify(newSettings), (err) => {
      writing = false;
      if (err) {
        console.log(err);
      } else {
        settings = newSettings;
      }

      const next = queued;
      queued = undefined;
      if (next && next !== settings) {
        write(next);
      }
    });
  }

  // the store notifies on every action, most of which leave settings alone.
  // overlapping writes to the same file can interleave, so only one runs at a
  // time and the newest state waits its turn.
  api.persist = function persist(newSettings) {
    if (newSettings === settings) {
      return;
    }

    if (writing) {
      queued = newSettings;
      return;
    }

    write(newSettings);
  };

  return api;
};
