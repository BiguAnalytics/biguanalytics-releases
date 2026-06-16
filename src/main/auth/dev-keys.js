// @ts-check
const crypto = require('crypto');

// Development-only key pair for BIGU_LICENSE_DEV_MOCK. It is generated per
// process so no private signing key is shipped in the Electron source.
const devKeyPair = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem',
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem',
  },
});

const DEV_LICENSE_PRIVATE_KEY = devKeyPair.privateKey;
const DEV_LICENSE_PUBLIC_KEY = devKeyPair.publicKey;

module.exports = {
  DEV_LICENSE_PRIVATE_KEY,
  DEV_LICENSE_PUBLIC_KEY,
};
