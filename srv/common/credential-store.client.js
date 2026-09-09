'use strict';

const https = require('https');
const { importPKCS8, compactDecrypt } = require('jose');

/**
 * Minimal SAP Credential Store REST client: mTLS authentication + JWE-encrypted
 * response payloads, per the SAP Credential Store REST API guide (help.sap.com,
 * "SAP Credential Store", sections 1.6.1.2 "Mutual TLS" and 1.6.2 "Encrypting
 * Payloads"). This assumes the service instance was created with the default
 * `authentication.type: oauth:mtls` (default for the trial/standard/free plans) -
 * if the instance was explicitly configured with `basic` auth instead, swap the
 * https.Agent below for an `Authorization: Basic` header and drop the client cert.
 *
 * Mirrors the purpose of capacityplanningscreens' srv/common/auth.utility.js
 * readCredential(), rewritten from scratch against the documented API contract
 * rather than copied, since that file's crypto internals were not available to
 * read in this session.
 */

function pemFromPkcs8Base64(base64Der) {
  return `-----BEGIN PRIVATE KEY-----\n${base64Der}\n-----END PRIVATE KEY-----\n`;
}

/**
 * @param {object} binding - the Credential Store service binding (from VCAP_SERVICES),
 *   containing `url`, `certificate`, `key`, and `encryption.client_private_key`.
 * @param {string} namespace - the sapcp-credstore-namespace to query.
 * @param {string} name - the credential name within that namespace.
 * @returns {Promise<{username?: string, value: string}>}
 */
async function readPasswordCredential(binding, namespace, name) {
  const agent = new https.Agent({
    cert: binding.certificate,
    key: binding.key
  });

  const url = `${binding.url}/password?name=${encodeURIComponent(name)}`;
  const jwe = await new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: 'GET',
        agent,
        headers: {
          'sapcp-credstore-namespace': namespace,
          'Cache-Control': 'no-cache'
        }
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`Credential Store GET failed: ${res.statusCode} ${Buffer.concat(chunks)}`));
          } else {
            resolve(Buffer.concat(chunks).toString('utf8'));
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });

  const privateKey = await importPKCS8(
    pemFromPkcs8Base64(binding.encryption.client_private_key),
    'RSA-OAEP-256'
  );
  const { plaintext } = await compactDecrypt(jwe, privateKey);
  return JSON.parse(Buffer.from(plaintext).toString('utf8'));
}

module.exports = { readPasswordCredential };
