//
//  testPort.js
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

// Specs need a port before they listen, so it cannot be left to the OS with
// listen(0). Every one is random and probed for being free, which is the only
// way two runs, or a run and whatever else is on the machine, cannot collide.
// Probing has to happen in a child process to stay synchronous: the specs open
// their servers while the module is still loading.
var execFileSync = require('child_process').execFileSync;

var handedOut = {};

function isFree(port) {
  var probe =
    "var s = require('net').createServer();" +
    "s.once('error', function() { process.exit(1); });" +
    's.listen(' +
    port +
    ', function() { s.close(function() { process.exit(0); }); });';

  try {
    execFileSync(process.execPath, ['-e', probe], {stdio: 'ignore'});
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = function testPort() {
  for (var i = 0; i < 100; i++) {
    // the ephemeral range, where nothing is registered
    var port = 49152 + Math.floor(Math.random() * 16000);
    if (handedOut[port]) continue;
    if (isFree(port)) {
      handedOut[port] = true;
      return port;
    }
  }

  throw new Error('could not find a free port');
};
