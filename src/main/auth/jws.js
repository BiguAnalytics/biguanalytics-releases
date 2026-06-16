// @ts-check
const crypto = require('crypto');

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value) {
  return Buffer.from(String(value || ''), 'base64url').toString('utf8');
}

/**
 * @param {object} payload
 * @param {string} privateKey
 * @returns {string}
 */
function signJws(payload, privateKey) {
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  return `${signingInput}.${signer.sign(privateKey).toString('base64url')}`;
}

/**
 * @param {string} token
 * @param {string} publicKey
 * @returns {object|null}
 */
function verifyJws(token, publicKey) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3 || !publicKey) return null;
  const [header, body, signature] = parts;
  let parsedHeader;
  try {
    parsedHeader = JSON.parse(base64UrlDecode(header));
  } catch {
    return null;
  }
  if (parsedHeader.alg !== 'RS256') return null;

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${header}.${body}`);
  verifier.end();
  const isValid = verifier.verify(publicKey, Buffer.from(signature, 'base64url'));
  if (!isValid) return null;

  try {
    return JSON.parse(base64UrlDecode(body));
  } catch {
    return null;
  }
}

module.exports = {
  base64UrlDecode,
  base64UrlEncode,
  signJws,
  verifyJws,
};
