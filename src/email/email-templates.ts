/**
 * 邮件 HTML 模板
 */

import { brand } from '../config/brand.js';

const BRAND_NAME = brand.displayName;
const BRAND_PANEL = '#0f172a';
const BRAND_PANEL_ACCENT = '#1e293b';
const BRAND_TEXT = '#475569';
const BRAND_MUTED = '#94a3b8';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function wrapLayout(title: string, preview: string, body: string): string {
  const safeTitle = escapeHtml(title);
  const safePreview = escapeHtml(preview);
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeTitle}</title></head>
<body style="margin:0;padding:0;background:#020617;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${safePreview}</div>
<table width="100%" cellpadding="0" cellspacing="0" style="background:
radial-gradient(circle at top,#0f172a 0%,#020617 58%,#020617 100%);padding:40px 20px;">
<tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;background:#f8fafc;border-radius:28px;overflow:hidden;box-shadow:0 18px 60px rgba(15,23,42,0.34);">
  <tr><td style="padding:24px 32px;background:linear-gradient(135deg,#020617 0%,#0f172a 50%,#1d4ed8 100%);">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="left">
          <p style="margin:0 0 10px;color:rgba(226,232,240,0.72);font-size:12px;letter-spacing:0.28em;text-transform:uppercase;">Narrative Access</p>
          <h1 style="margin:0;color:#f8fafc;font-size:28px;font-weight:800;letter-spacing:0.04em;">${BRAND_NAME}</h1>
        </td>
        <td align="right" valign="top">
          <div style="display:inline-block;padding:8px 14px;border:1px solid rgba(125,211,252,0.3);border-radius:999px;background:rgba(15,23,42,0.35);color:#e0f2fe;font-size:12px;font-weight:600;">创作权限通知</div>
        </td>
      </tr>
    </table>
  </td></tr>
  <tr><td style="padding:36px 32px 32px;background:
linear-gradient(180deg,#f8fafc 0%,#eff6ff 100%);">${body}</td></tr>
  <tr><td style="padding:20px 32px;background:#e2e8f0;border-top:1px solid rgba(148,163,184,0.28);">
    <p style="margin:0 0 6px;color:#334155;font-size:12px;font-weight:700;">此邮件由 ${BRAND_NAME} 平台自动发送</p>
    <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;">请勿直接回复。若不是您本人发起申请，请忽略本邮件。</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export function buildInviteCodeEmailHtml(applicantName: string, inviteCode: string, platformUrl: string): string {
  const safeApplicantName = escapeHtml(applicantName.trim() || '创作者');
  const safeInviteCode = escapeHtml(inviteCode.trim());
  const safePlatformUrl = escapeHtml(platformUrl.trim());
  const body = `
    <div style="margin:0 0 24px;padding:24px;border-radius:24px;background:linear-gradient(135deg,${BRAND_PANEL} 0%,${BRAND_PANEL_ACCENT} 58%,#1d4ed8 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,0.06);">
      <div style="display:inline-block;margin:0 0 14px;padding:7px 12px;border-radius:999px;background:rgba(56,189,248,0.12);border:1px solid rgba(125,211,252,0.25);color:#bae6fd;font-size:12px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;">Access Granted</div>
      <h2 style="margin:0 0 14px;color:#f8fafc;font-size:28px;line-height:1.25;">恭喜，您的内测申请已通过</h2>
      <p style="margin:0;color:#cbd5e1;font-size:15px;line-height:1.8;">
        <strong style="color:#ffffff;">${safeApplicantName}</strong>，您好。您已经获得 ${BRAND_NAME} 的创作入口，
        下面的邀请码可直接用于开通作家资格。
      </p>
    </div>
    <p style="margin:0 0 14px;color:${BRAND_TEXT};font-size:15px;line-height:1.8;">
      感谢您申请加入 ${BRAND_NAME} 内测。经审核，您的申请已通过，以下是您的专属邀请码：
    </p>
    <div style="margin:0 0 24px;padding:24px;border-radius:24px;background:#ffffff;border:1px solid rgba(125,211,252,0.42);box-shadow:0 12px 30px rgba(14,165,233,0.12);text-align:center;">
      <p style="margin:0 0 10px;color:#64748b;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;">Exclusive Invite Code</p>
      <p style="margin:0 0 12px;color:#0369a1;font-size:32px;font-weight:800;font-family:'Courier New',Consolas,monospace;letter-spacing:0.18em;">${safeInviteCode}</p>
      <p style="margin:0;color:${BRAND_MUTED};font-size:13px;line-height:1.7;">建议妥善保存。邀请码通常为一次性使用，请勿转发给他人。</p>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr>
        <td style="padding:0 0 12px;color:#0f172a;font-size:18px;font-weight:800;">使用方式</td>
      </tr>
      <tr>
        <td>
          <div style="margin:0 0 12px;padding:16px 18px;border-radius:18px;background:rgba(255,255,255,0.72);border:1px solid rgba(148,163,184,0.22);">
            <span style="display:inline-block;width:28px;height:28px;line-height:28px;text-align:center;border-radius:50%;background:#0ea5e9;color:#ffffff;font-size:14px;font-weight:800;margin-right:10px;">1</span>
            <span style="color:${BRAND_TEXT};font-size:14px;line-height:1.8;">打开注册页面，选择“注册为作家”。</span>
          </div>
          <div style="margin:0 0 12px;padding:16px 18px;border-radius:18px;background:rgba(255,255,255,0.72);border:1px solid rgba(148,163,184,0.22);">
            <span style="display:inline-block;width:28px;height:28px;line-height:28px;text-align:center;border-radius:50%;background:#2563eb;color:#ffffff;font-size:14px;font-weight:800;margin-right:10px;">2</span>
            <span style="color:${BRAND_TEXT};font-size:14px;line-height:1.8;">在邀请码输入框填入上方专属邀请码。</span>
          </div>
          <div style="padding:16px 18px;border-radius:18px;background:rgba(255,255,255,0.72);border:1px solid rgba(148,163,184,0.22);">
            <span style="display:inline-block;width:28px;height:28px;line-height:28px;text-align:center;border-radius:50%;background:#4f46e5;color:#ffffff;font-size:14px;font-weight:800;margin-right:10px;">3</span>
            <span style="color:${BRAND_TEXT};font-size:14px;line-height:1.8;">完成注册后，即可直接进入创作工作台。</span>
          </div>
        </td>
      </tr>
    </table>
    <div style="margin:0 0 20px;text-align:center;">
      <a href="${safePlatformUrl}" style="display:inline-block;padding:14px 34px;background:linear-gradient(135deg,#0ea5e9,#2563eb 58%,#4f46e5 100%);color:#ffffff;text-decoration:none;border-radius:999px;font-size:15px;font-weight:800;box-shadow:0 14px 26px rgba(37,99,235,0.24);">立即前往注册</a>
    </div>
    <div style="padding:16px 18px;border-radius:18px;background:rgba(14,165,233,0.08);border:1px solid rgba(125,211,252,0.38);">
      <p style="margin:0 0 6px;color:#0f172a;font-size:14px;font-weight:700;">注册提示</p>
      <p style="margin:0;color:${BRAND_TEXT};font-size:13px;line-height:1.8;">
        如果按钮无法点击，可复制以下地址到浏览器打开：<br>
        <a href="${safePlatformUrl}" style="color:#2563eb;text-decoration:none;word-break:break-all;">${safePlatformUrl}</a>
      </p>
    </div>`;
  return wrapLayout('内测邀请码', `您的${BRAND_NAME} 邀请码已送达，复制邀请码即可完成作家注册。`, body);
}

export function buildRejectionEmailHtml(applicantName: string, reason?: string): string {
  const safeApplicantName = escapeHtml(applicantName.trim() || '申请者');
  const safeReason = reason?.trim() ? escapeHtml(reason.trim()) : '';
  const reasonBlock = reason
    ? `<p style="margin:16px 0;padding:14px 18px;background:#fef2f2;border-radius:10px;border:1px solid #fecaca;color:#991b1b;font-size:14px;line-height:1.6;">${safeReason}</p>`
    : '';
  const body = `
    <h2 style="margin:0 0 16px;color:#0f172a;font-size:20px;">内测申请审核结果通知</h2>
    <p style="margin:0 0 12px;color:${BRAND_TEXT};font-size:15px;line-height:1.7;">
      ${safeApplicantName}，您好！
    </p>
    <p style="margin:0 0 12px;color:${BRAND_TEXT};font-size:15px;line-height:1.7;">
      感谢您对 ${BRAND_NAME} 的关注和申请。经审核，您的本次申请暂未通过。
    </p>
    ${reasonBlock}
    <p style="margin:0;color:${BRAND_TEXT};font-size:15px;line-height:1.7;">
      您可以在之后重新提交申请。如有疑问，欢迎联系我们。
    </p>`;
  return wrapLayout('申请审核结果', '很抱歉，本次内测申请暂未通过。', body);
}
