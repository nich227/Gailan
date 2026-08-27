var http = require('http');

module.exports = function httpGet(url, callback) {
  var buffer = '';

  http
    .get(url, {agent: false}, function(res) {
      res.setEncoding('utf8');
      res.on('data', (chunk) => buffer += chunk );
      res.on('end', () => callback(res, buffer) );
    })
    .on('error', (err) => callback({statusCode: 0, error: err}, ''));
};
