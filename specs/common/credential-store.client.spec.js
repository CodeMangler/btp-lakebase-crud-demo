import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { generateKeyPair, exportPKCS8, CompactEncrypt } from 'jose';

// jose is genuine ESM with a frozen, non-configurable module namespace -
// neither vi.spyOn nor vi.mock() reliably intercepts it when consumed via
// require() the way our CJS source does (confirmed directly against plain
// Node, not just this test runner). Rather than fight that boundary, the
// crypto runs for real here against a throwaway RSA keypair generated once
// below - a stronger test anyway, since it proves genuine interop with
// jose's actual encryption format rather than that a mock was called.
// https is a Node builtin (CJS-shaped, configurable) - vi.spyOn works on it
// directly, so only the network layer needs mocking.
const https = require('https');
vi.spyOn(https, 'Agent').mockImplementation(function AgentMock(opts) { this.opts = opts; });
const requestSpy = vi.spyOn(https, 'request');

const { readPasswordCredential } = require('../../srv/common/credential-store.client.js');

let publicKey;
let privateKeyPkcs8Base64;

beforeAll(async () => {
  const { publicKey: pub, privateKey: priv } = await generateKeyPair('RSA-OAEP-256', {
    modulusLength: 2048,
    extractable: true
  });
  publicKey = pub;
  // The raw base64 DER a Credential Store binding actually contains - our
  // source's pemFromPkcs8Base64() re-adds the PEM wrapper around exactly
  // this, so stripping it here mirrors the real shape being tested.
  const pem = await exportPKCS8(priv);
  privateKeyPkcs8Base64 = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
});

async function encryptedPayload(obj) {
  const plaintext = new TextEncoder().encode(JSON.stringify(obj));
  return new CompactEncrypt(plaintext)
    .setProtectedHeader({ alg: 'RSA-OAEP-256', enc: 'A256GCM' })
    .encrypt(publicKey);
}

function fakeResponse(statusCode) {
  const listeners = {};
  return {
    statusCode,
    on(event, cb) { listeners[event] = cb; return this; },
    emit(event, ...args) { listeners[event] && listeners[event](...args); }
  };
}

function mockRequestSuccess(statusCode, body) {
  requestSpy.mockImplementation((url, options, callback) => {
    const res = fakeResponse(statusCode);
    queueMicrotask(() => {
      callback(res);
      res.emit('data', Buffer.from(body));
      res.emit('end');
    });
    return { on: vi.fn(), end: vi.fn() };
  });
}

const binding = (overrides = {}) => ({
  url: 'https://credstore.example.com/api/v1/credentials',
  certificate: 'CERT',
  key: 'KEY',
  get encryption() { return { client_private_key: privateKeyPkcs8Base64 }; },
  ...overrides
});

describe('readPasswordCredential', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds the mTLS agent from the binding cert/key and calls the /password endpoint', async () => {
    mockRequestSuccess(200, await encryptedPayload({ value: 'secret-pass' }));

    const result = await readPasswordCredential(binding(), 'my-namespace', 'PGWS');

    expect(result).toEqual({ value: 'secret-pass' });
    expect(https.Agent).toHaveBeenCalledWith({ cert: 'CERT', key: 'KEY' });

    const [url, options] = requestSpy.mock.calls[0];
    expect(url).toBe('https://credstore.example.com/api/v1/credentials/password?name=PGWS');
    expect(options.method).toBe('GET');
    expect(options.headers['sapcp-credstore-namespace']).toBe('my-namespace');
  });

  it('URL-encodes the credential name', async () => {
    mockRequestSuccess(200, await encryptedPayload({ value: 'x' }));

    await readPasswordCredential(binding(), 'ns', 'name with spaces');

    const [url] = requestSpy.mock.calls[0];
    expect(url).toContain('name=name%20with%20spaces');
  });

  it('correctly decrypts a real JWE payload encrypted with the corresponding public key', async () => {
    mockRequestSuccess(200, await encryptedPayload({ value: 'pw', username: 'u' }));

    const result = await readPasswordCredential(binding(), 'ns', 'name');

    expect(result).toEqual({ value: 'pw', username: 'u' });
  });

  it('rejects rather than returning garbage when decryption fails (e.g. wrong key)', async () => {
    const { publicKey: wrongPublicKey } = await generateKeyPair('RSA-OAEP-256', { modulusLength: 2048 });
    const plaintext = new TextEncoder().encode(JSON.stringify({ value: 'pw' }));
    const wrongJwe = await new CompactEncrypt(plaintext)
      .setProtectedHeader({ alg: 'RSA-OAEP-256', enc: 'A256GCM' })
      .encrypt(wrongPublicKey);
    mockRequestSuccess(200, wrongJwe);

    await expect(readPasswordCredential(binding(), 'ns', 'name')).rejects.toThrow();
  });

  it('rejects with the HTTP error before ever attempting to decrypt on a non-200 response', async () => {
    mockRequestSuccess(404, 'not found');

    // If this reached decryption, "not found" isn't valid JWE and the
    // rejection message would be a jose parse error, not a 404 - asserting
    // the 404 text is what proves the short-circuit happens where expected.
    await expect(readPasswordCredential(binding(), 'ns', 'name')).rejects.toThrow(/404/);
  });

  it('rejects if the underlying request errors (e.g. connection refused)', async () => {
    requestSpy.mockImplementation(() => {
      const listeners = {};
      const req = { on(event, cb) { listeners[event] = cb; return this; }, end: vi.fn() };
      queueMicrotask(() => listeners.error(new Error('ECONNREFUSED')));
      return req;
    });

    await expect(readPasswordCredential(binding(), 'ns', 'name')).rejects.toThrow('ECONNREFUSED');
  });
});
