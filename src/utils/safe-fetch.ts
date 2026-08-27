import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import type { RequestOptions } from 'node:http';
import { assertSafeUrl, isPublicIpAddress } from './url-safety.js';

const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export const SAFE_FETCH_RESPONSE_LIMITS = Object.freeze({
  metadata: 2 * 1024 * 1024,
  image: 25 * 1024 * 1024,
  syncArchive: 500 * 1024 * 1024,
});

export interface SafeFetchInit {
  method?: string;
  headers?: Headers | Record<string, string> | string[][];
  body?: string | Buffer | Uint8Array;
  signal?: AbortSignal;
  redirect?: 'error' | 'follow' | 'manual';
  maxRedirects?: number;
  maxResponseBytes?: number;
}

type ResolvedAddress = {
  address: string;
  family: 4 | 6;
};

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw signal.reason instanceof Error ? signal.reason : new Error('Request aborted');
  }
}

async function resolvePublicAddress(target: URL, signal?: AbortSignal): Promise<ResolvedAddress> {
  throwIfAborted(signal);
  const hostname = target.hostname.startsWith('[') && target.hostname.endsWith(']')
    ? target.hostname.slice(1, -1)
    : target.hostname;
  const literalFamily = isIP(hostname);
  if (literalFamily) {
    if (!isPublicIpAddress(hostname)) {
      throw new Error(`不允许访问内部或保留网络地址: ${target.hostname}`);
    }
    return { address: hostname, family: literalFamily as 4 | 6 };
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  throwIfAborted(signal);
  if (addresses.length === 0) {
    throw new Error(`无法解析主机: ${hostname}`);
  }
  if (addresses.some(({ address }) => !isPublicIpAddress(address))) {
    throw new Error(`主机解析到了内部或保留网络地址: ${hostname}`);
  }

  const selected = addresses[0];
  if (selected.family !== 4 && selected.family !== 6) {
    throw new Error(`不支持的地址类型: ${selected.family}`);
  }
  return { address: selected.address, family: selected.family };
}

function toRequestHeaders(
  headersInit: Headers | Record<string, string> | string[][] | undefined,
  target: URL,
  body?: Buffer,
): Headers {
  const headers = new Headers(headersInit);
  headers.set('host', target.host);
  if (body && !headers.has('content-length')) {
    headers.set('content-length', String(body.byteLength));
  }
  return headers;
}

async function requestOnce(target: URL, init: SafeFetchInit): Promise<Response> {
  assertSafeUrl(target.href);
  const resolved = await resolvePublicAddress(target, init.signal);
  const body = init.body === undefined ? undefined : Buffer.from(init.body);
  const headers = toRequestHeaders(init.headers, target, body);
  const maxResponseBytes = init.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const options: RequestOptions & { servername?: string } = {
    protocol: target.protocol,
    hostname: resolved.address,
    family: resolved.family,
    port: target.port || undefined,
    path: `${target.pathname}${target.search}`,
    method: init.method ?? 'GET',
    headers: Object.fromEntries(headers.entries()),
    signal: init.signal,
  };
  if (target.protocol === 'https:' && !isIP(target.hostname)) {
    options.servername = target.hostname;
  }

  const transport = target.protocol === 'https:' ? https : http;
  return new Promise<Response>((resolve, reject) => {
    const request = transport.request(options, (incoming) => {
      const chunks: Buffer[] = [];
      let totalBytes = 0;

      incoming.on('data', (chunk: Buffer) => {
        totalBytes += chunk.byteLength;
        if (totalBytes > maxResponseBytes) {
          incoming.destroy(new Error(`响应超过大小限制: ${maxResponseBytes} bytes`));
          return;
        }
        chunks.push(chunk);
      });
      incoming.once('error', reject);
      incoming.once('end', () => {
        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (Array.isArray(value)) {
            for (const item of value) responseHeaders.append(name, item);
          } else if (value !== undefined) {
            responseHeaders.set(name, value);
          }
        }
        const status = incoming.statusCode ?? 500;
        const responseBody = status === 204 || status === 205 || status === 304
          ? null
          : Buffer.concat(chunks);
        resolve(new Response(responseBody, {
          status,
          statusText: incoming.statusMessage,
          headers: responseHeaders,
        }));
      });
    });
    request.once('error', reject);
    request.end(body);
  });
}

function shouldSwitchToGet(status: number, method: string): boolean {
  return status === 303 || ((status === 301 || status === 302) && method === 'POST');
}

export async function safeFetch(rawUrl: string | URL, init: SafeFetchInit = {}): Promise<Response> {
  let target = new URL(rawUrl);
  let method = (init.method ?? 'GET').toUpperCase();
  let body = init.body;
  let headers = new Headers(init.headers);
  const signal = init.signal ?? AbortSignal.timeout(DEFAULT_REQUEST_TIMEOUT_MS);
  const redirectMode = init.redirect ?? 'follow';
  const maxRedirects = init.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

  for (let redirectCount = 0; ; redirectCount++) {
    const response = await requestOnce(target, { ...init, signal, method, body, headers });
    if (!REDIRECT_STATUSES.has(response.status)) return response;
    if (redirectMode === 'manual') return response;
    if (redirectMode === 'error') throw new Error(`不允许重定向: HTTP ${response.status}`);
    if (redirectCount >= maxRedirects) throw new Error(`重定向次数超过限制: ${maxRedirects}`);

    const location = response.headers.get('location');
    if (!location) return response;
    const nextTarget = new URL(location, target);
    assertSafeUrl(nextTarget.href);
    if (nextTarget.origin !== target.origin) {
      headers = new Headers(headers);
      headers.delete('authorization');
      headers.delete('cookie');
      headers.delete('proxy-authorization');
    }
    if (shouldSwitchToGet(response.status, method)) {
      method = 'GET';
      body = undefined;
      headers.delete('content-length');
      headers.delete('content-type');
    }
    target = nextTarget;
  }
}
