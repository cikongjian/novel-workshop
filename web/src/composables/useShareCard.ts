/**
 * 章节卡片分享 composable
 * Canvas 名片式设计：名句大字居中，书名/来源缩在底部
 */
import { ref } from 'vue';
import QRCode from 'qrcode';
import { brand } from '../config/brand';

export interface CardTemplate {
  id: string;
  name: string;
  size: [number, number];
  fontFamily: string;
}

export const CARD_TEMPLATES: CardTemplate[] = [
  { id: 'warm', name: '暖光书页', size: [750, 1000], fontFamily: '"Noto Serif SC", "STSong", "SimSun", serif' },
  { id: 'dark', name: '暗夜灯下', size: [750, 1000], fontFamily: '"Noto Serif SC", "STSong", "SimSun", serif' },
  { id: 'clean', name: '纯净白', size: [750, 1000], fontFamily: '"PingFang SC", "Microsoft YaHei", "Helvetica Neue", sans-serif' },
];

interface Palette {
  bg: string;
  cardBg: string;
  text: string;
  accent: string;
  accentDim: string;
  line: string;
  footerText: string;
}
const PALETTES: Record<string, Palette> = {
  warm: {
    bg: '#f5efe2',
    cardBg: '#fdfaf4',
    text: '#3d2e1f',
    accent: '#b8860b',
    accentDim: '#c9a050',
    line: '#d4c5a0',
    footerText: '#9a8560',
  },
  dark: {
    bg: '#12121f',
    cardBg: '#1a1a2e',
    text: '#f0ece0',
    accent: '#d4a853',
    accentDim: '#b8943e',
    line: '#2e2a3d',
    footerText: '#8a8578',
  },
  clean: {
    bg: '#f0f2f5',
    cardBg: '#ffffff',
    text: '#1a1a2e',
    accent: '#0ea5e9',
    accentDim: '#38bdf8',
    line: '#e2e5ea',
    footerText: '#9ca3af',
  },
};

export interface ShareCardData {
  text: string;
  novelTitle: string;
  authorName: string;
  chapterTitle?: string;
  platformName?: string;
  shareUrl?: string;
  showQrPlaceholder?: boolean;
}

export function useShareCard() {
  const generating = ref(false);
  const generatedImageUrl = ref<string | null>(null);
  const activeTemplateId = ref(CARD_TEMPLATES[0].id);

  const tmpl = () => CARD_TEMPLATES.find((t) => t.id === activeTemplateId.value) ?? CARD_TEMPLATES[0];
  const pal = () => PALETTES[tmpl().id] ?? PALETTES.warm;

  /* ── 工具函数 ── */

  function measureText(ctx: CanvasRenderingContext2D, text: string, font: string): number {
    ctx.font = font;
    return ctx.measureText(text).width;
  }

  function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const lines: string[] = [];
    let cur = '';
    for (const ch of text) {
      const test = cur + ch;
      if (ctx.measureText(test).width > maxWidth && cur.length > 0) {
        lines.push(cur);
        cur = ch;
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function drawDivider(ctx: CanvasRenderingContext2D, y: number, p: Palette, left: number, right: number) {
    const mid = (left + right) / 2;
    ctx.strokeStyle = p.line;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(mid - 16, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(mid + 16, y); ctx.lineTo(right, y); ctx.stroke();

    // 中间小菱形
    ctx.fillStyle = p.accent;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.moveTo(mid, y - 5); ctx.lineTo(mid + 7, y);
    ctx.lineTo(mid, y + 5); ctx.lineTo(mid - 7, y);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /* ── 核心生成 ── */

  async function generateCard(data: ShareCardData): Promise<string | null> {
    generating.value = true;
    generatedImageUrl.value = null;
    try {
      const template = tmpl();
      const p = pal();
      const [W, H] = template.size;
      const S = 2;
      const canvas = document.createElement('canvas');
      canvas.width = W * S;
      canvas.height = H * S;

      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.scale(S, S);

      // ══ 全幅背景 ══
      const bgGrad = ctx.createLinearGradient(0, 0, W * 0.7, H);
      bgGrad.addColorStop(0, p.cardBg);
      bgGrad.addColorStop(1, p.bg);
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // ══ 布局参数 ══
      const padX = 72;
      const contentW = W - padX * 2;
      const maxLines = 10;

      // ══ 大字引用号（左上） ══
      ctx.fillStyle = p.accent;
      ctx.globalAlpha = 0.22;
      ctx.font = `160px ${template.fontFamily}`;
      ctx.fillText('\u201C', padX - 8, 220);
      ctx.globalAlpha = 1;

      // ══ 引用正文 — 动态字号 ══
      // 根据文字量自适应字号：短句更大，长段适当缩小
      const charCount = data.text.length;
      let quoteSize: number;
      if (charCount <= 40) quoteSize = 44;
      else if (charCount <= 80) quoteSize = 40;
      else if (charCount <= 150) quoteSize = 36;
      else quoteSize = 32;

      const lineH = quoteSize * 1.9;
      const quoteFont = `${quoteSize}px ${template.fontFamily}`;
      const quoteLines = wrapLines(ctx, data.text, contentW);
      const rendered = Math.min(quoteLines.length, maxLines);

      // 计算引用块总高度，垂直居中
      const quoteBlockH = rendered * lineH;
      const quoteY0 = Math.round((H - quoteBlockH) / 2 - 40);

      ctx.fillStyle = p.text;
      ctx.font = quoteFont;
      for (let i = 0; i < rendered; i++) {
        ctx.fillText(quoteLines[i], padX, quoteY0 + i * lineH);
      }

      // 省略提示
      if (quoteLines.length > maxLines) {
        ctx.fillStyle = p.footerText;
        ctx.globalAlpha = 0.5;
        ctx.font = `${quoteSize * 0.75}px ${template.fontFamily}`;
        ctx.fillText('……', padX, quoteY0 + rendered * lineH);
        ctx.globalAlpha = 1;
      }

      // ══ 大字引用号（右下） ══
      const lastLineW = rendered > 0 ? measureText(ctx, quoteLines[rendered - 1], quoteFont) : 0;
      const rightQuoteX = Math.min(padX + lastLineW + 16, W - padX - 20);
      ctx.fillStyle = p.accent;
      ctx.globalAlpha = 0.22;
      ctx.font = `160px ${template.fontFamily}`;
      ctx.fillText('\u201D', rightQuoteX, quoteY0 + (rendered - 1) * lineH + 60);
      ctx.globalAlpha = 1;

      // ══ 分隔线 ══
      const dividerY = quoteY0 + rendered * lineH + 60;
      const divLeft = padX + 20;
      const divRight = W - padX - 20;
      drawDivider(ctx, dividerY, p, divLeft, divRight);

      // ══ 书名 ══
      const metaY0 = dividerY + 48;
      const titleSize = 28;
      ctx.fillStyle = p.text;
      ctx.font = `bold ${titleSize}px ${template.fontFamily}`;
      ctx.fillText(`《${data.novelTitle}》`, padX, metaY0);

      // 章节
      if (data.chapterTitle) {
        ctx.font = `18px ${template.fontFamily}`;
        ctx.fillStyle = p.footerText;
        ctx.fillText(data.chapterTitle, padX, metaY0 + 38);
      }

      // ══ 底部 ══
      const footY = H - 56;
      const footSize = 18;
      ctx.font = `${footSize}px ${template.fontFamily}`;
      ctx.fillStyle = p.footerText;
      ctx.globalAlpha = 0.65;

      if (data.authorName) {
        ctx.fillText(`${data.authorName} 分享`, padX, footY);
      }
      const platform = `来自 ${data.platformName ?? brand.displayName}`;
      const pw = measureText(ctx, platform, `${footSize}px ${template.fontFamily}`);
      ctx.fillText(platform, W - padX - pw, footY);
      ctx.globalAlpha = 1;

      // ══ 真实二维码 + 扫码提示（右下角） ══
      if (data.showQrPlaceholder && data.shareUrl) {
        const qrSize = 96;
        const qrX = W - padX - qrSize;
        const qrY = H - padX - qrSize;

        // 用 qrcode 库生成真实二维码到临时 canvas
        try {
          const qrCanvas = document.createElement('canvas');
          await QRCode.toCanvas(qrCanvas, data.shareUrl, {
            width: qrSize * 2,
            margin: 1,
            color: {
              dark: p.text,
              light: p.cardBg,
            },
          });
          ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);
        } catch {
          // 二维码生成失败时降级为 URL 文字
          ctx.fillStyle = p.footerText;
          ctx.globalAlpha = 0.7;
          const urlLines = wrapLines(ctx, data.shareUrl, qrSize);
          const urlSize = 12;
          ctx.font = `${urlSize}px ${template.fontFamily}`;
          for (let i = 0; i < Math.min(urlLines.length, 4); i++) {
            ctx.fillText(urlLines[i], qrX, qrY + 20 + i * 18);
          }
          ctx.globalAlpha = 1;
        }

        // 二维码下方提示文字
        const tipSize = 13;
        ctx.font = `${tipSize}px ${template.fontFamily}`;
        ctx.fillStyle = p.footerText;
        ctx.globalAlpha = 0.75;
        const tip = '扫码阅读全文';
        const tipW = measureText(ctx, tip, `${tipSize}px ${template.fontFamily}`);
        const tipX = qrX + qrSize / 2 - tipW / 2;
        ctx.fillText(tip, tipX, qrY + qrSize + 20);
        ctx.globalAlpha = 1;
      }

      // ══ 导出 ══
      const url = canvas.toDataURL('image/png');
      generatedImageUrl.value = url;
      return url;
    } catch {
      return null;
    } finally {
      generating.value = false;
    }
  }

  async function shareImage(dataUrl?: string): Promise<boolean> {
    const url = dataUrl ?? generatedImageUrl.value;
    if (!url) return false;

    if (navigator.share) {
      try {
        const blob = await (await fetch(url)).blob();
        const file = new File([blob], 'share-card.png', { type: 'image/png' });
        await navigator.share({ files: [file] });
        return true;
      } catch { /* 用户取消 */ }
    }

    const a = document.createElement('a');
    a.href = url;
    a.download = 'share-card.png';
    a.click();
    return true;
  }

  function selectTemplate(id: string) { activeTemplateId.value = id; }

  return {
    generating,
    generatedImageUrl,
    activeTemplateId,
    activeTemplate: () => tmpl(),
    templates: CARD_TEMPLATES,
    selectTemplate,
    generateCard,
    shareImage,
  };
}
