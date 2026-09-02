import fetch from 'node-fetch';
import { createSSRFSafeAgents } from '~/auth';

export const DEFAULT_REMOTE_IMAGE_MAX_BYTES: number = 25 * 1024 * 1024;
export const DEFAULT_REMOTE_IMAGE_TIMEOUT_MS: number = 15_000;

export interface FetchRemoteImageOptions {
  maxBytes?: number;
  timeoutMs?: number;
}

/**
 * Downloads a provider-generated image without exposing LibreChat to arbitrary
 * protocols, redirects, private network targets, or unbounded response bodies.
 */
export async function fetchRemoteImageBuffer(
  input: string,
  options: FetchRemoteImageOptions = {},
): Promise<Buffer> {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error('Invalid remote image URL');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(`Refusing to fetch remote image over ${parsed.protocol}`);
  }

  const maxBytes = options.maxBytes ?? DEFAULT_REMOTE_IMAGE_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_REMOTE_IMAGE_TIMEOUT_MS;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error('Remote image size limit must be a positive integer');
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('Remote image timeout must be a positive integer');
  }

  const { httpsAgent } = createSSRFSafeAgents();
  const response = await fetch(parsed.href, {
    agent: httpsAgent,
    redirect: 'error',
    timeout: timeoutMs,
    size: maxBytes,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch remote image. Status: ${response.status}`);
  }

  const contentLengthHeader = response.headers.get('content-length');
  if (contentLengthHeader != null) {
    const contentLength = Number.parseInt(contentLengthHeader, 10);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new Error(`Remote image response too large: ${contentLength} bytes`);
    }
  }

  const buffer = await response.buffer();
  if (buffer.length > maxBytes) {
    throw new Error(`Remote image response too large: ${buffer.length} bytes`);
  }

  return buffer;
}
