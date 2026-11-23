'use strict';

const runShellCommand = require('./runShellCommand');
const pollingContext = require('./pollingContext');

module.exports = function runCommand(widget, callback, context) {
  const {command, refreshFrequency} = widget;

  return pollingContext.run(context, () => {
    if (typeof command === 'function') {
      command.apply(widget, [callback]);
    } else if (typeof command === 'string') {
      runShellCommand(command, callback).timeout(refreshFrequency);
    } else {
      callback();
    }
  });
};
