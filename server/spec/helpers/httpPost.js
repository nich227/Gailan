var http = require('http');

module.exports = function httpPost(url, postData, callback) {
  // no keep-alive pool: specs restart servers on the same port, and a pooled
  // socket to the old one hangs up mid-request
  var options = {
    method: 'POST',
    headers: { 'Content-Length': postData.length },
    agent: false,
  };

  var req = http.request(url, options, (res) => {
    var buffer = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => buffer += chunk);
    res.on('end', () => callback(res, buffer));
  });

  req.on('error', (err) => callback({statusCode: 0, error: err}, ''));

  req.write(postData);
  req.end();
};
