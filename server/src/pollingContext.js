'use strict';

let active = null;

exports.run = function run(context, command) {
  const previous = active;
  active = context;
  try {
    return command();
  } finally {
    // do not carry a scheduled command's scope into later promise callbacks
    // or user interactions in the same web view
    active = previous;
  }
};

exports.headers = function headers() {
  if (
    !active ||
    active.forced ||
    active.implementation.commandScope === 'screen'
  )
    return;
  const interval = active.implementation.refreshFrequency;
  if (
    typeof interval !== 'number' ||
    !Number.isFinite(interval) ||
    interval <= 0 ||
    interval > 2147483647
  )
    return;
  const key = encodeURIComponent(
    JSON.stringify([active.id, active.revision, active.config]),
  );
  if (key.length > 4096) return;
  return {'X-Gailan-Poll-Key': key, 'X-Gailan-Poll-Interval': String(interval)};
};
