/**
 * URL 安全校验工具
 *
 * 防止 SSRF 攻击：
 * - 仅允许 http/https 协议
 * - 禁止访问私有 IP 范围和回环地址
 * - 禁止云元数据端点
 */

import { BlockList, isIP } from 'node:net';

const BLOCKED_IPV4 = new BlockList();
const BLOCKED_IPV6 = new BlockList();

BLOCKED_IPV4.addSubnet('0.0.0.0', 8, 'ipv4');
BLOCKED_IPV4.addSubnet('10.0.0.0', 8, 'ipv4');
BLOCKED_IPV4.addSubnet('100.64.0.0', 10, 'ipv4');
BLOCKED_IPV4.addSubnet('127.0.0.0', 8, 'ipv4');
BLOCKED_IPV4.addSubnet('169.254.0.0', 16, 'ipv4');
BLOCKED_IPV4.addSubnet('172.16.0.0', 12, 'ipv4');
BLOCKED_IPV4.addSubnet('192.0.0.0', 24, 'ipv4');
BLOCKED_IPV4.addSubnet('192.0.2.0', 24, 'ipv4');
BLOCKED_IPV4.addSubnet('192.31.196.0', 24, 'ipv4');
BLOCKED_IPV4.addSubnet('192.52.193.0', 24, 'ipv4');
BLOCKED_IPV4.addSubnet('192.88.99.0', 24, 'ipv4');
BLOCKED_IPV4.addSubnet('192.168.0.0', 16, 'ipv4');
BLOCKED_IPV4.addSubnet('192.175.48.0', 24, 'ipv4');
BLOCKED_IPV4.addSubnet('198.18.0.0', 15, 'ipv4');
BLOCKED_IPV4.addSubnet('198.51.100.0', 24, 'ipv4');
BLOCKED_IPV4.addSubnet('203.0.113.0', 24, 'ipv4');
BLOCKED_IPV4.addSubnet('224.0.0.0', 4, 'ipv4');
BLOCKED_IPV4.addSubnet('240.0.0.0', 4, 'ipv4');

BLOCKED_IPV6.addAddress('::', 'ipv6');
BLOCKED_IPV6.addAddress('::1', 'ipv6');
BLOCKED_IPV6.addSubnet('::ffff:0:0', 96, 'ipv6');
BLOCKED_IPV6.addSubnet('64:ff9b::', 96, 'ipv6');
BLOCKED_IPV6.addSubnet('64:ff9b:1::', 48, 'ipv6');
BLOCKED_IPV6.addSubnet('100::', 64, 'ipv6');
BLOCKED_IPV6.addSubnet('2001::', 23, 'ipv6');
BLOCKED_IPV6.addSubnet('fc00::', 7, 'ipv6');
BLOCKED_IPV6.addSubnet('fe80::', 10, 'ipv6');
BLOCKED_IPV6.addSubnet('ff00::', 8, 'ipv6');
BLOCKED_IPV6.addSubnet('2002::', 16, 'ipv6');
BLOCKED_IPV6.addSubnet('3fff::', 20, 'ipv6');
BLOCKED_IPV6.addSubnet('5f00::', 16, 'ipv6');

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '0.0.0.0',
  'metadata.google.internal',
  'metadata.google',
]);

const BLOCKED_HOSTNAME_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa'];

function normalizeIpAddress(value: string): string {
  return value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1) : value;
}

export function isPublicIpAddress(value: string): boolean {
  const address = normalizeIpAddress(value);
  const family = isIP(address);
  if (family === 4) return !BLOCKED_IPV4.check(address, 'ipv4');
  if (family === 6) return !BLOCKED_IPV6.check(address, 'ipv6');
  return false;
}

/**
 * 校验 URL 是否安全可用于服务端请求
 * @throws Error 如果 URL 不安全
 */
export function assertSafeUrl(rawUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`无效的 URL: ${rawUrl}`);
  }

  // 仅允许 http/https 协议
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`不允许的 URL 协议: ${parsed.protocol}`);
  }

  const hostname = parsed.hostname.toLowerCase();

  if (parsed.username || parsed.password) {
    throw new Error('URL 中不允许包含凭据');
  }

  // 阻止已知危险主机名
  const bareHostname = normalizeIpAddress(hostname).replace(/\.$/, '');
  if (
    BLOCKED_HOSTNAMES.has(bareHostname)
    || BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => bareHostname.endsWith(suffix))
  ) {
    throw new Error(`不允许访问的主机: ${hostname}`);
  }

  if (isIP(bareHostname) && !isPublicIpAddress(bareHostname)) {
    throw new Error(`不允许访问内部或保留网络地址: ${hostname}`);
  }
}

/**
 * 校验图片 URL 是否安全（用于从外部下载图片）
 * @throws Error 如果 URL 不安全
 */
export function assertSafeImageUrl(imageUrl: string): void {
  assertSafeUrl(imageUrl);
  // 额外禁止 data: URL 直接绕过
  if (imageUrl.startsWith('data:')) {
    throw new Error('不允许 data: 协议的图片 URL');
  }
}
