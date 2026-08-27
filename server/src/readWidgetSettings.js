//
//  readWidgetSettings.js
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

// A widget can declare its own settings in a widget.json beside it. The app turns
// each one into a control, and the value reaches the widget's render as
// props.settings. Nothing here is required: a widget without a manifest simply
// has no settings to offer.

const fs = require('fs');
const path = require('path');

const TYPES = ['choice', 'toggle', 'number', 'text', 'color'];

function isUsable(setting) {
  if (!setting || typeof setting !== 'object') return false;
  if (typeof setting.key !== 'string' || !setting.key) return false;
  if (TYPES.indexOf(setting.type) === -1) return false;
  // a choice with nothing to choose from would render an empty control
  if (setting.type === 'choice') {
    return Array.isArray(setting.options) && setting.options.length > 0;
  }
  return true;
}

function normalize(setting) {
  const clean = {
    key: setting.key,
    type: setting.type,
    label: typeof setting.label === 'string' ? setting.label : setting.key,
  };

  if (setting.help) clean.help = String(setting.help);
  if (setting.default !== undefined) clean.default = setting.default;

  if (setting.type === 'choice') {
    clean.options = setting.options.map((option) =>
      typeof option === 'object' && option
        ? {value: option.value, label: option.label || String(option.value)}
        : {value: option, label: String(option)}
    );
  }

  if (setting.type === 'number') {
    clean.min = typeof setting.min === 'number' ? setting.min : 0;
    clean.max = typeof setting.max === 'number' ? setting.max : 100;
    clean.step = typeof setting.step === 'number' ? setting.step : 1;
  }

  return clean;
}

// the manifest sits next to the widget, which for a folder widget means beside
// its entry file rather than at the top of the widget directory
module.exports = function readWidgetSettings(filePath) {
  const manifest = path.join(path.dirname(filePath), 'widget.json');

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  } catch (err) {
    // no manifest, or one that is not JSON: the widget just has no settings
    return [];
  }

  if (!Array.isArray(raw.settings)) return [];

  return raw.settings.filter(isUsable).map(normalize);
};

module.exports.defaultsFor = function defaultsFor(schema) {
  const values = {};
  (schema || []).forEach((setting) => {
    if (setting.default !== undefined) values[setting.key] = setting.default;
  });
  return values;
};
