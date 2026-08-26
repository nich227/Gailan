const post = require('superagent').post;

function wrapError(err, res) {
  return err ? new Error((res || {}).text || 'error running command') : null;
}

function isKeepAliveError(err) {
  return err && err.message.indexOf('Request has been terminated') === 0;
}

module.exports = function runShellCommand(command, callback) {
  const request = post('/run/')
    .retry(2, isKeepAliveError)
    .send(command);

  if (!callback) {
    return request
      .catch((err) => {
        throw wrapError(err, err.response);
      })
      .then((res) => res.text);
  }

  // end() used to return the request and callers chain onto it, so hand back
  // the request rather than whatever end() gives us
  request.end((err, res) => callback(wrapError(err, res), (res || {}).text));
  return request;
};
