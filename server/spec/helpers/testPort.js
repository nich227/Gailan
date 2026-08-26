// Specs want a fixed port, but it might be taken on a dev machine. Probing has
// to happen in a child process so it can stay synchronous: the specs open their
// servers while the module is still loading.
var execFileSync = require('child_process').execFileSync;

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

module.exports = function testPort(preferred) {
  if (isFree(preferred)) return preferred;

  for (var i = 0; i < 50; i++) {
    var port = 1024 + Math.floor(Math.random() * 60000);
    if (isFree(port)) {
      console.log('# port ' + preferred + ' is taken, using ' + port);
      return port;
    }
  }

  throw new Error('could not find a free port');
};
