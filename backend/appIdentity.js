const crypto = require('crypto');
const path = require('path');

function getInstanceId(
  executablePath = process.pkg ? process.execPath : path.resolve(__dirname, '..'),
) {
  const normalizedPath = path.normalize(path.resolve(executablePath)).toLowerCase();
  return crypto.createHash('sha256').update(normalizedPath).digest('hex').slice(0, 16);
}

module.exports = { getInstanceId };
