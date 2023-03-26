const crypto = require('crypto');

const timestamp = () => Math.floor(new Date().valueOf() / 1000);
// prettier-ignore
const randomHash = (n) => new Array(n).fill().map(_ => Math.floor(Math.random()*16).toString(16)).join('');
const digest = (msg, alg = 'sha256') => crypto.createHash(alg).update(msg).digest('hex');
function formatBytes(bytes, decimals = 1) {
  if (!+bytes) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function fromEntries(arr) {
  return arr.reduce((acc, [key, val]) => {
    acc[key] = acc[key] ? acc[key] + ', ' + val : val;
    return acc;
  }, {});
}

module.exports = {
  timestamp,
  randomHash,
  digest,
  formatBytes,
  fromEntries,
};
