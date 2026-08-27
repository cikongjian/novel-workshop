import { BlockList, isIP } from 'node:net';

const ALLOWED_SERVICE_IPS = new BlockList();
ALLOWED_SERVICE_IPS.addSubnet('10.0.0.0', 8, 'ipv4');
ALLOWED_SERVICE_IPS.addSubnet('127.0.0.0', 8, 'ipv4');
ALLOWED_SERVICE_IPS.addSubnet('172.16.0.0', 12, 'ipv4');
ALLOWED_SERVICE_IPS.addSubnet('192.168.0.0', 16, 'ipv4');
ALLOWED_SERVICE_IPS.addAddress('::1', 'ipv6');
ALLOWED_SERVICE_IPS.addSubnet('fc00::', 7, 'ipv6');
ALLOWED_SERVICE_IPS.addSubnet('fe80::', 10, 'ipv6');

function isAllowedServiceHost(hostname: string): boolean {
  const bareHostname = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
  const family = isIP(bareHostname);
  if (family === 4) return ALLOWED_SERVICE_IPS.check(bareHostname, 'ipv4');
  if (family === 6) return ALLOWED_SERVICE_IPS.check(bareHostname, 'ipv6');
  return bareHostname.toLowerCase() === 'localhost';
}

export function validateServiceUrl(raw: string | undefined, fallback: string): string | null {
  const urlString = raw?.trim() || fallback;
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password || !isAllowedServiceHost(parsed.hostname)) return null;
    if (parsed.hostname.toLowerCase() === 'localhost') parsed.hostname = '127.0.0.1';
    return parsed.origin;
  } catch {
    return null;
  }
}

export function requireServiceUrl(raw: string | undefined, fallback: string): string {
  const validated = validateServiceUrl(raw, fallback);
  if (!validated) throw new Error('不合法的 TTS 服务地址，仅允许本机或内网 IP');
  return validated;
}
