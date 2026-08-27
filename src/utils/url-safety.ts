/**
 * URL 安全校验工具
 *
 * 防止 SSRF 攻击：
 * - 仅允许 http/https 协议
 * - 禁止访问私有 IP 范围和回环地址
 * - 禁止云元数据端点
 */

const PRIVATE_IP_PATTERNS = [
  /^127\./,                     // 127.0.0.0/8 回环
  /^10\./,                      // 10.0.0.0/8 私有
  /^172\.(1[6-9]|2\d|3[01])\./, // 172.16.0.0/12 私有
  /^192\.168\./,                // 192.168.0.0/16 私有
  /^169\.254\./,                // 169.254.0.0/16 链路本地 / 云元数据
  /^0\./,                       // 0.0.0.0/8
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // 100.64.0.0/10 CGNAT
];

// IPv6 私有/保留段前缀（小写，已去掉方括号）
const PRIVATE_IPV6_PREFIXES = [
  '::ffff:',   // IPv4-mapped IPv6（如 ::ffff:127.0.0.1）
  'fc',        // fc00::/7 唯一本地地址 ULA
  'fd',        // fd00::/8 唯一本地地址 ULA
  'fe80',      // fe80::/10 链路本地
];

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '0.0.0.0',
  'metadata.google.internal',
  'metadata.google',
]);

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

  // 阻止已知危险主机名
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new Error(`不允许访问的主机: ${hostname}`);
  }

  // 阻止 IPv6 回环和私有
  if (hostname === '[::1]' || hostname === '::1') {
    throw new Error('不允许访问回环地址');
  }

  // 阻止 IPv6 私有/保留段（去掉方括号后检测前缀）
  const bareIpv6 = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1).toLowerCase()
    : hostname.toLowerCase();
  for (const prefix of PRIVATE_IPV6_PREFIXES) {
    if (bareIpv6.startsWith(prefix)) {
      // IPv4-mapped IPv6：提取后段再走 IPv4 规则检查
      if (prefix === '::ffff:') {
        const ipv4Part = bareIpv6.slice('::ffff:'.length);
        for (const pattern of PRIVATE_IP_PATTERNS) {
          if (pattern.test(ipv4Part)) {
            throw new Error(`不允许访问内部网络地址（IPv4-mapped IPv6）: ${hostname}`);
          }
        }
      } else {
        throw new Error(`不允许访问内部网络地址（IPv6 私有段）: ${hostname}`);
      }
    }
  }

  // 阻止十进制/八进制/十六进制非标准 IP（纯数字 hostname = 十进制整数 IP）
  if (/^\d+$/.test(hostname)) {
    throw new Error(`不允许使用非标准 IP 格式: ${hostname}`);
  }

  // 阻止私有 IP 范围
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      throw new Error(`不允许访问内部网络地址: ${hostname}`);
    }
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
