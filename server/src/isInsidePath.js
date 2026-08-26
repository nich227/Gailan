'use strict';

// true when filePath is dirPath or sits inside it. A plain prefix check would
// count /widgets/barcode as being inside /widgets/bar.
module.exports = function isInsidePath(filePath, dirPath) {
  if (filePath === dirPath) {
    return true;
  }

  if (filePath.indexOf(dirPath) !== 0) {
    return false;
  }

  return (
    dirPath[dirPath.length - 1] === '/' || filePath[dirPath.length] === '/'
  );
};
