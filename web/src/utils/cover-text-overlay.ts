export type CoverTextOverlayStyle = 'webnovel' | 'cinematic' | 'minimal';
export type CoverLayoutTemplate =
  | 'fanqie-action'
  | 'fanqie-romance'
  | 'qidian-epic'
  | 'qidian-delicate'
  | 'print-edition';

export type CoverTextOverlayInput = {
  imageUrl: string;
  title: string;
  author?: string;
  style?: CoverTextOverlayStyle;
  template?: CoverLayoutTemplate;
};

export type CoverOverlayAsset = {
  file: File;
  objectUrl: string;
};

const TITLE_FONT_FAMILY = '"Noto Serif SC", "Source Han Serif SC", "Songti SC", "STSong", serif';
const AUTHOR_FONT_FAMILY = '"Noto Sans SC", "Microsoft YaHei", "PingFang SC", sans-serif';

type OverlayPalette = {
  titleFill: string;
  titleStroke: string;
  titleShadow: string;
  panelStart: string;
  panelEnd: string;
  authorBg: string;
  authorFill: string;
};

type LayoutMetrics = {
  titleTopRatio: number;
  horizontalPaddingRatio: number;
  maxLines: number;
  titleFontScale: number;
  titlePanelRadius: number;
  authorSide: 'left' | 'right';
  authorBottomRatio: number;
  authorScale: number;
  vignetteStrength: 'soft' | 'medium' | 'strong';
};

const STYLE_PALETTES: Record<CoverTextOverlayStyle, OverlayPalette> = {
  webnovel: {
    titleFill: '#fff7e8',
    titleStroke: 'rgba(0, 0, 0, 0.42)',
    titleShadow: 'rgba(0, 0, 0, 0.45)',
    panelStart: 'rgba(8, 10, 18, 0.10)',
    panelEnd: 'rgba(8, 10, 18, 0.46)',
    authorBg: 'rgba(12, 16, 28, 0.56)',
    authorFill: 'rgba(255, 248, 238, 0.96)',
  },
  cinematic: {
    titleFill: '#f4f7ff',
    titleStroke: 'rgba(5, 11, 28, 0.58)',
    titleShadow: 'rgba(8, 18, 46, 0.52)',
    panelStart: 'rgba(8, 18, 44, 0.06)',
    panelEnd: 'rgba(8, 18, 44, 0.36)',
    authorBg: 'rgba(10, 24, 48, 0.52)',
    authorFill: 'rgba(236, 244, 255, 0.96)',
  },
  minimal: {
    titleFill: '#ffffff',
    titleStroke: 'rgba(0, 0, 0, 0.22)',
    titleShadow: 'rgba(0, 0, 0, 0.28)',
    panelStart: 'rgba(8, 10, 18, 0.00)',
    panelEnd: 'rgba(8, 10, 18, 0.18)',
    authorBg: 'rgba(255, 255, 255, 0.14)',
    authorFill: 'rgba(255, 255, 255, 0.94)',
  },
};

const TEMPLATE_METRICS: Record<CoverLayoutTemplate, LayoutMetrics> = {
  'fanqie-action': {
    titleTopRatio: 0.06,
    horizontalPaddingRatio: 0.08,
    maxLines: 3,
    titleFontScale: 0.135,
    titlePanelRadius: 24,
    authorSide: 'right',
    authorBottomRatio: 0.075,
    authorScale: 0.042,
    vignetteStrength: 'strong',
  },
  'fanqie-romance': {
    titleTopRatio: 0.08,
    horizontalPaddingRatio: 0.1,
    maxLines: 3,
    titleFontScale: 0.118,
    titlePanelRadius: 22,
    authorSide: 'left',
    authorBottomRatio: 0.08,
    authorScale: 0.038,
    vignetteStrength: 'medium',
  },
  'qidian-epic': {
    titleTopRatio: 0.11,
    horizontalPaddingRatio: 0.1,
    maxLines: 3,
    titleFontScale: 0.115,
    titlePanelRadius: 18,
    authorSide: 'left',
    authorBottomRatio: 0.085,
    authorScale: 0.038,
    vignetteStrength: 'medium',
  },
  'qidian-delicate': {
    titleTopRatio: 0.13,
    horizontalPaddingRatio: 0.11,
    maxLines: 3,
    titleFontScale: 0.106,
    titlePanelRadius: 16,
    authorSide: 'right',
    authorBottomRatio: 0.085,
    authorScale: 0.036,
    vignetteStrength: 'soft',
  },
  'print-edition': {
    titleTopRatio: 0.15,
    horizontalPaddingRatio: 0.12,
    maxLines: 2,
    titleFontScale: 0.098,
    titlePanelRadius: 12,
    authorSide: 'left',
    authorBottomRatio: 0.09,
    authorScale: 0.034,
    vignetteStrength: 'soft',
  },
};

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('封面底图加载失败'));
    img.src = url;
  });
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const chars = [...text.trim()];
  if (chars.length === 0) return [];

  const lines: string[] = [];
  let current = '';

  for (const char of chars) {
    const candidate = current + char;
    if (current && ctx.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = char;
    } else {
      current = candidate;
    }
  }

  if (current) {
    lines.push(current);
  }
  return lines;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function renderTitleBlock(
  ctx: CanvasRenderingContext2D,
  title: string,
  width: number,
  height: number,
  style: CoverTextOverlayStyle,
  template: CoverLayoutTemplate,
): void {
  const palette = STYLE_PALETTES[style];
  const metrics = TEMPLATE_METRICS[template];
  const horizontalPadding = width * metrics.horizontalPaddingRatio;
  const top = height * metrics.titleTopRatio;
  const maxWidth = width - horizontalPadding * 2;
  const maxLines = Math.min(metrics.maxLines, style === 'minimal' ? 2 : 3);
  let fontSize = Math.floor(width * Math.min(
    metrics.titleFontScale,
    style === 'minimal' ? 0.1 : 0.14,
  ));
  let lines: string[] = [];

  while (fontSize >= 34) {
    ctx.font = `700 ${fontSize}px ${TITLE_FONT_FAMILY}`;
    lines = wrapLines(ctx, title, maxWidth);
    if (lines.length <= maxLines) break;
    fontSize -= 4;
  }

  lines = lines.slice(0, maxLines);
  if (lines.length === 0) return;

  const lineHeight = fontSize * 1.08;
  const blockHeight = lineHeight * lines.length + 28;
  const blockY = top;

  ctx.save();
  drawRoundedRect(
    ctx,
    horizontalPadding - 18,
    blockY - 18,
    maxWidth + 36,
    blockHeight + 12,
    style === 'minimal' ? 14 : metrics.titlePanelRadius,
  );
  const bgGradient = ctx.createLinearGradient(0, blockY, 0, blockY + blockHeight);
  bgGradient.addColorStop(0, palette.panelStart);
  bgGradient.addColorStop(1, palette.panelEnd);
  ctx.fillStyle = bgGradient;
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.textBaseline = 'top';
  ctx.shadowColor = palette.titleShadow;
  ctx.shadowBlur = style === 'minimal' ? 10 : 18;
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, fontSize * (style === 'minimal' ? 0.05 : 0.08));
  ctx.strokeStyle = palette.titleStroke;
  ctx.fillStyle = palette.titleFill;
  ctx.font = `700 ${fontSize}px ${TITLE_FONT_FAMILY}`;

  lines.forEach((line, index) => {
    const y = blockY + index * lineHeight;
    ctx.strokeText(line, horizontalPadding, y);
    ctx.fillText(line, horizontalPadding, y);
  });
  ctx.restore();
}

function renderAuthorBlock(
  ctx: CanvasRenderingContext2D,
  author: string,
  width: number,
  height: number,
  style: CoverTextOverlayStyle,
  template: CoverLayoutTemplate,
): void {
  if (!author.trim()) return;

  const palette = STYLE_PALETTES[style];
  const layout = TEMPLATE_METRICS[template];
  const paddingX = width * 0.08;
  const bottom = height * layout.authorBottomRatio;
  const text = `作者 ${author.trim()}`;
  const fontSize = Math.max(20, Math.floor(width * layout.authorScale));

  ctx.save();
  ctx.font = `600 ${fontSize}px ${AUTHOR_FONT_FAMILY}`;
  const textMetrics = ctx.measureText(text);
  const boxWidth = textMetrics.width + 36;
  const boxHeight = fontSize + 24;
  const x = layout.authorSide === 'left'
    ? paddingX
    : width - paddingX - boxWidth;
  const y = height - bottom - boxHeight;

  drawRoundedRect(ctx, x, y, boxWidth, boxHeight, 999);
  ctx.fillStyle = palette.authorBg;
  ctx.fill();

  ctx.textBaseline = 'middle';
  ctx.fillStyle = palette.authorFill;
  ctx.fillText(text, x + 18, y + boxHeight / 2);
  ctx.restore();
}

async function renderOverlayBlob(input: CoverTextOverlayInput): Promise<Blob> {
  const style = input.style ?? 'webnovel';
  const template = input.template ?? 'fanqie-action';
  const image = await loadImageElement(input.imageUrl);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('浏览器不支持 Canvas 2D');
  }

  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  const vignette = ctx.createLinearGradient(0, 0, 0, canvas.height);
  const vignetteStrength = TEMPLATE_METRICS[template].vignetteStrength;
  if (style === 'minimal' || vignetteStrength === 'soft') {
    vignette.addColorStop(0, 'rgba(6, 8, 16, 0.08)');
    vignette.addColorStop(1, 'rgba(6, 8, 16, 0.18)');
  } else if (vignetteStrength === 'strong') {
    vignette.addColorStop(0, 'rgba(6, 8, 16, 0.24)');
    vignette.addColorStop(0.3, 'rgba(6, 8, 16, 0.08)');
    vignette.addColorStop(1, 'rgba(6, 8, 16, 0.42)');
  } else {
    vignette.addColorStop(0, 'rgba(6, 8, 16, 0.18)');
    vignette.addColorStop(0.3, 'rgba(6, 8, 16, 0.04)');
    vignette.addColorStop(1, 'rgba(6, 8, 16, 0.34)');
  }
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  renderTitleBlock(ctx, input.title, canvas.width, canvas.height, style, template);
  renderAuthorBlock(ctx, input.author ?? '', canvas.width, canvas.height, style, template);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (!value) {
        reject(new Error('封面导出失败'));
        return;
      }
      resolve(value);
    }, 'image/jpeg', 0.92);
  });
}

export async function buildOverlayCoverAsset(input: CoverTextOverlayInput): Promise<CoverOverlayAsset> {
  const blob = await renderOverlayBlob(input);
  const file = new File([blob], 'cover-overlay.jpg', { type: 'image/jpeg' });
  return {
    file,
    objectUrl: URL.createObjectURL(blob),
  };
}

export async function buildOverlayCoverFile(input: CoverTextOverlayInput): Promise<File> {
  const asset = await buildOverlayCoverAsset(input);
  URL.revokeObjectURL(asset.objectUrl);
  return asset.file;
}
