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
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isNamedEmailAddress(value: string): boolean {
  return /^.+<\s*[^\s@]+@[^\s@]+\.[^\s@]+\s*>$/.test(value);
}

function normalizeSenderAddress(from: string, user: string): string {
  const candidate = from.trim();
  const fallback = user.trim();

  if (!candidate) {
    return fallback;
  }

  if (isEmailAddress(candidate) || isNamedEmailAddress(candidate)) {
    return candidate;
  }

  // If users enter only a display name, pair it with the authenticated mailbox.
  return `"${candidate.replace(/"/g, '\\"')}" <${fallback}>`;
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

  async function sendHtmlEmail(to: string, subject: string, html: string): Promise<void> {
    await transporter.sendMail({
      from,
      to,
      subject,
      html,
      envelope: {
        from: config.user,
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
