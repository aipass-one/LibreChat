jest.mock('node-fetch');
jest.mock('~/auth', () => ({
  createSSRFSafeAgents: jest.fn(() => ({
    httpAgent: { kind: 'http' },
    httpsAgent: { kind: 'https' },
  })),
}));

import fetch from 'node-fetch';
import { createSSRFSafeAgents } from '~/auth';
import { fetchRemoteImageBuffer } from './remote';

const mockedFetch = fetch as jest.MockedFunction<typeof fetch>;

function makeResponse({
  ok = true,
  status = 200,
  body = Buffer.from('image'),
  contentLength,
}: {
  ok?: boolean;
  status?: number;
  body?: Buffer;
  contentLength?: number;
} = {}) {
  return {
    ok,
    status,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'content-length' && contentLength != null
          ? String(contentLength)
          : null,
    },
    buffer: jest.fn(async () => body),
  };
}

describe('fetchRemoteImageBuffer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('downloads a direct HTTPS response through the SSRF-safe agent', async () => {
    mockedFetch.mockResolvedValueOnce(makeResponse() as never);

    await expect(
      fetchRemoteImageBuffer('https://cdn.example.com/generated.png', {
        maxBytes: 100,
        timeoutMs: 1234,
      }),
    ).resolves.toEqual(Buffer.from('image'));

    expect(createSSRFSafeAgents).toHaveBeenCalledTimes(1);
    expect(mockedFetch).toHaveBeenCalledWith('https://cdn.example.com/generated.png', {
      agent: { kind: 'https' },
      redirect: 'error',
      timeout: 1234,
      size: 100,
    });
  });

  it.each(['not-a-url', 'http://cdn.example.com/image.png', 'file:///etc/passwd'])(
    'rejects unsafe input %s before making a request',
    async (url) => {
      await expect(fetchRemoteImageBuffer(url)).rejects.toThrow();
      expect(mockedFetch).not.toHaveBeenCalled();
    },
  );

  it('rejects a non-success response', async () => {
    mockedFetch.mockResolvedValueOnce(makeResponse({ ok: false, status: 503 }) as never);

    await expect(fetchRemoteImageBuffer('https://cdn.example.com/image.png')).rejects.toThrow(
      'Status: 503',
    );
  });

  it('rejects an oversized Content-Length before reading the body', async () => {
    const response = makeResponse({ contentLength: 101 });
    mockedFetch.mockResolvedValueOnce(response as never);

    await expect(
      fetchRemoteImageBuffer('https://cdn.example.com/image.png', { maxBytes: 100 }),
    ).rejects.toThrow('Remote image response too large: 101 bytes');
    expect(response.buffer).not.toHaveBeenCalled();
  });

  it('rejects an oversized body when Content-Length is absent or understated', async () => {
    mockedFetch.mockResolvedValueOnce(makeResponse({ body: Buffer.alloc(101) }) as never);

    await expect(
      fetchRemoteImageBuffer('https://cdn.example.com/image.png', { maxBytes: 100 }),
    ).rejects.toThrow('Remote image response too large: 101 bytes');
  });

  it('propagates redirect, timeout, size, and SSRF errors from the fetch layer', async () => {
    mockedFetch.mockRejectedValueOnce(new Error('SSRF protection blocked the destination'));

    await expect(fetchRemoteImageBuffer('https://internal.example.com/image.png')).rejects.toThrow(
      'SSRF protection',
    );
  });
});
