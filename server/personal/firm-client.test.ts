import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { firmMe, firmTimeoutMs } from './firm-client.js';

let server: Server | null = null;

afterEach(async () => {
  delete process.env.STEVENS_FIRM_URL;
  delete process.env.STEVENS_FIRM_TIMEOUT_MS;
  if (server) {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = null;
  }
});

describe('firm client timeout', () => {
  it('defaults to 120s and honors the override', async () => {
    expect(firmTimeoutMs()).toBe(120000);
    process.env.STEVENS_FIRM_TIMEOUT_MS = '5000';
    expect(firmTimeoutMs()).toBe(5000);
    process.env.STEVENS_FIRM_TIMEOUT_MS = 'nonsense';
    expect(firmTimeoutMs()).toBe(120000);
  });

  it('fails closed when the firm accepts and never answers', async () => {
    server = createServer(() => {});
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as AddressInfo).port;
    process.env.STEVENS_FIRM_URL = 'http://127.0.0.1:' + port;
    process.env.STEVENS_FIRM_TIMEOUT_MS = '200';
    await expect(firmMe()).rejects.toThrow();
  });

  it('fails fast when nothing listens', async () => {
    process.env.STEVENS_FIRM_URL = 'http://127.0.0.1:9';
    await expect(firmMe()).rejects.toThrow();
  });
});
