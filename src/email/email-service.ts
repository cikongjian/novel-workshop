import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { createLogger } from '../utils/logger.js';
import { buildInviteCodeEmailHtml, buildRejectionEmailHtml } from './email-templates.js';
import { brand } from '../config/brand.js';

const log = createLogger('EmailService');

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

export interface EmailService {
  sendInviteCodeEmail(to: string, applicantName: string, inviteCode: string, platformUrl: string): Promise<void>;
  sendRejectionEmail(to: string, applicantName: string, reason?: string): Promise<void>;
  sendTestEmail(to: string): Promise<void>;
  testConnection(): Promise<boolean>;
}

function isEmailAddress(value: string): boolean {
  if (value.length === 0 || value.length > 254) return false;
  if ([...value].some((char) => char.trim().length === 0)) return false;
  const at = value.indexOf('@');
  if (at <= 0 || at !== value.lastIndexOf('@') || at === value.length - 1) return false;
  const domain = value.slice(at + 1);
  if (domain.startsWith('.') || domain.endsWith('.') || !domain.includes('.')) return false;
  return domain.split('.').every((label) => label.length > 0 && label.length <= 63);
}

export type NormalizedSenderAddress = string | { name: string; address: string };

function parseNamedEmailAddress(value: string): { name: string; address: string } | null {
  if (value.includes('\r') || value.includes('\n') || !value.endsWith('>')) return null;
  const opening = value.lastIndexOf('<');
  if (opening <= 0) return null;
  let displayName = value.slice(0, opening).trim();
  const address = value.slice(opening + 1, -1).trim();
  if (!displayName || !isEmailAddress(address)) return null;
  if (displayName.length >= 2 && displayName.startsWith('"') && displayName.endsWith('"')) {
    displayName = displayName.slice(1, -1);
  }
  return { name: displayName, address };
}

function sanitizeDisplayName(value: string): string {
  let sanitized = '';
  for (const char of value) {
    if (char === '\r' || char === '\n') continue;
    sanitized += char;
  }
  return sanitized;
}

function requireMailbox(value: string): string {
  if (!isEmailAddress(value)) {
    throw new Error('SMTP 发件地址无效，请将 SMTP_FROM 配置为有效邮箱');
  }
  return value;
}

export function normalizeSenderAddress(from: string, user: string): NormalizedSenderAddress {
  const candidate = from.trim();
  const fallback = user.trim();

  if (!candidate) {
    return requireMailbox(fallback);
  }

  if (isEmailAddress(candidate)) return candidate;

  const namedAddress = parseNamedEmailAddress(candidate);
  if (namedAddress) return namedAddress;

  // If users enter only a display name, pair it with the authenticated mailbox.
  return { name: sanitizeDisplayName(candidate), address: requireMailbox(fallback) };
}

/**
 * 创建邮件服务。SMTP 未配置时返回 undefined。
 */
export function createEmailService(config: SmtpConfig): EmailService | undefined {
  if (!config.host || !config.user || !config.pass) {
    log.info('SMTP 未配置，邮件服务不可用');
    return undefined;
  }

  const transporter: Transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  const from = normalizeSenderAddress(config.from, config.user);
  const envelopeFrom = typeof from === 'string' ? from : from.address;

  async function sendHtmlEmail(to: string, subject: string, html: string): Promise<void> {
    await transporter.sendMail({
      from,
      to,
      subject,
      html,
      envelope: {
        from: envelopeFrom,
        to,
      },
    });
  }

  return {
    async sendInviteCodeEmail(to, applicantName, inviteCode, platformUrl) {
      const html = buildInviteCodeEmailHtml(applicantName, inviteCode, platformUrl);
      await sendHtmlEmail(to, `${brand.displayName} 内测邀请码`, html);
      log.info(`邀请码邮件已发送至 ${to}`);
    },

    async sendRejectionEmail(to, applicantName, reason) {
      const html = buildRejectionEmailHtml(applicantName, reason);
      await sendHtmlEmail(to, `${brand.displayName} 内测申请结果`, html);
      log.info(`拒绝通知邮件已发送至 ${to}`);
    },

    async sendTestEmail(to) {
      await sendHtmlEmail(
        to,
        `${brand.displayName} 邮件服务测试`,
        [
          '<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;',
          'background:#0f172a;color:#e2e8f0;border-radius:16px">',
          '<h2 style="color:#a78bfa;margin:0 0 16px">邮件服务测试成功</h2>',
          '<p style="line-height:1.7;margin:0 0 16px">',
          '如果您收到了这封邮件，说明 SMTP 邮件服务配置正确，系统可以正常发送邮件。</p>',
          `<p style="font-size:13px;color:#94a3b8;margin:0">— ${brand.displayName} 平台</p>`,
          '</div>',
        ].join(''),
      );
      log.info(`测试邮件已发送至 ${to}`);
    },

    async testConnection() {
      try {
        await transporter.verify();
        log.info('SMTP 连接测试成功');
        return true;
      } catch (err) {
        log.error('SMTP 连接测试失败', { message: err instanceof Error ? err.message : String(err) });
        return false;
      }
    },
  };
}

/** 从环境变量构建 SmtpConfig */
export function getSmtpConfigFromEnv(): SmtpConfig {
  return {
    host: process.env.SMTP_HOST ?? '',
    port: Number.parseInt(process.env.SMTP_PORT ?? '465', 10),
    secure: (process.env.SMTP_SECURE ?? 'true') === 'true',
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.SMTP_FROM ?? '',
  };
}
