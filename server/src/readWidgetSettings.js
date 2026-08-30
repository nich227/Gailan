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
const widgetConfigFile = require('./widgetConfigFile');

// choice and list are the same data with a different control: segments or a menu
const TYPES = ['choice', 'list', 'toggle', 'number', 'text', 'color'];
const NEEDS_OPTIONS = ['choice', 'list'];

function isUsable(setting) {
  if (!setting || typeof setting !== 'object') return false;
  if (typeof setting.key !== 'string' || !setting.key) return false;
  if (TYPES.indexOf(setting.type) === -1) return false;
  // something to choose from with nothing in it would render an empty control
  if (NEEDS_OPTIONS.indexOf(setting.type) > -1) {
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

  if (NEEDS_OPTIONS.indexOf(setting.type) > -1) {
    clean.options = setting.options.map((option) =>
      typeof option === 'object' && option
        ? {value: option.value, label: option.label || String(option.value)}
        : {value: option, label: String(option)}
    );
  }

  /* A setting can name others it depends on, and is offered but not usable while they
     hold something else. Values are compared as strings, the same as everywhere the app
     keeps a chosen value, so a boolean or a number in the manifest still matches. */
  const when = setting.enabledWhen;
  if (when && typeof when === 'object' && !Array.isArray(when)) {
    const conditions = {};
    Object.keys(when).forEach((key) => {
      const wanted = Array.isArray(when[key]) ? when[key] : [when[key]];
      const values = wanted
        .filter((value) => value !== undefined && value !== null)
        .map(String);
      if (values.length) conditions[key] = values;
    });
    if (Object.keys(conditions).length) clean.enabledWhen = conditions;
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

  const schema = raw.settings.filter(isUsable).map(normalize);

  /* settings.default.json sits beside the widget and stands in for the manifest's
     own defaults, so what a widget falls back to can be changed without editing
     the widget. Only keys the widget actually declares are taken from it. */
  const chosen = widgetConfigFile.readDefaults(filePath);
  schema.forEach((setting) => {
    if (chosen[setting.key] !== undefined) setting.default = chosen[setting.key];
  });

  return schema;
};

// The name a person should see, which the manifest can set. Without one the
// caller falls back to the widget id.
module.exports.titleFor = function titleFor(filePath) {
  const manifest = path.join(path.dirname(filePath), 'widget.json');
  try {
    const raw = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    return typeof raw.title === 'string' && raw.title ? raw.title : null;
  } catch (err) {
    return null;
  }
};

module.exports.defaultsFor = function defaultsFor(schema) {
  const values = {};
  (schema || []).forEach((setting) => {
    if (setting.default !== undefined) values[setting.key] = setting.default;
  });
  return values;
};
