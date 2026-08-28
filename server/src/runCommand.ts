'use strict';

const runShellCommand = require('./runShellCommand');

type Widget = {
  command?: string | ((callback: Callback) => void);
  refreshFrequency?: number;
};
type Callback = (err?: unknown, output?: string) => void;

module.exports = function runCommand(widget: Widget, callback: Callback) {
  const {command, refreshFrequency} = widget;

  if (typeof command === 'function') {
    command.apply(widget, [callback]);
  } else if (typeof command === 'string') {
    runShellCommand(command, callback).timeout(refreshFrequency);
  } else {
    callback();
  }
};
