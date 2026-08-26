var http = require('http');
var URL = require('url');

module.exports = function httpGet(url, callback) {
  var buffer = '';
  var options = URL.parse(url);
  options.agent = false;

  http
    .get(options, function(res) {
      res.setEncoding('utf8');
      res.on('data', (chunk) => buffer += chunk );
      res.on('end', () => callback(res, buffer) );
    })
    .on('error', (err) => callback({statusCode: 0, error: err}, ''));
};
