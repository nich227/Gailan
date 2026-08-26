var http = require('http');
var URL = require('url');

module.exports = function httpPost(url, postData, callback) {
  var options = URL.parse(url);
  options.method = 'POST';
  options.headers = { 'Content-Length': postData.length };
  // no keep-alive pool: specs restart servers on the same port, and a pooled
  // socket to the old one hangs up mid-request
  options.agent = false;

  var req = http.request(options, (res) => {
    var buffer = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => buffer += chunk);
    res.on('end', () => callback(res, buffer));
  });

  req.on('error', (err) => callback({statusCode: 0, error: err}, ''));

  req.write(postData);
  req.end();
};
