type VoiceDisplayProfile = {
  title: string;
  region: string;
  tone: string;
};

const VOICE_PROFILE_MAP: Record<string, VoiceDisplayProfile> = {
  Xiaoxiao: { title: '晓晓', region: '大陆女声', tone: '温柔甜美' },
  Xiaoyi: { title: '晓伊', region: '大陆女声', tone: '活泼轻快' },
  Xiaoxuan: { title: '晓萱', region: '大陆女声', tone: '自信干练' },
  Xiaobei: { title: '晓北', region: '东北女声', tone: '爽朗直率' },
  Xiaoni: { title: '晓妮', region: '陕西女声', tone: '质朴亲切' },
  Yunxi: { title: '云希', region: '大陆男声', tone: '清朗温和' },
  Yunjian: { title: '云健', region: '大陆男声', tone: '沉稳有力' },
  Yunyang: { title: '云扬', region: '大陆男声', tone: '播音专业' },
  Yunxia: { title: '云夏', region: '大陆男声', tone: '少年童声' },
  WanLung: { title: '云龙', region: '香港男声', tone: '粤语沉稳' },
  HiuGaai: { title: '晓佳', region: '香港女声', tone: '粤语温柔' },
  HiuMaan: { title: '晓曼', region: '香港女声', tone: '粤语知性' },
  YunJhe: { title: '云哲', region: '台湾男声', tone: '温和儒雅' },
  HsiaoChen: { title: '晓辰', region: '台湾女声', tone: '温柔细腻' },
  HsiaoYu: { title: '晓雨', region: '台湾女声', tone: '活泼明亮' },
  Yaoyao: { title: '瑶瑶', region: '大陆女声', tone: '柔和自然' },
};

function inferRegionFromLocale(locale: string): string {
  const normalized = locale.toLowerCase();
  if (normalized.includes('zh-hk') || normalized.includes('hong kong')) return '香港';
  if (normalized.includes('zh-tw') || normalized.includes('taiwan')) return '台湾';
  if (normalized.includes('liaoning')) return '东北';
  if (normalized.includes('shaanxi')) return '陕西';
  if (normalized.includes('zh-cn') || normalized.includes('mainland') || normalized.includes('prc')) return '大陆';
  return '中文';
}

function inferGenderFromName(rawName: string): '男声' | '女声' | '中性' {
  if (/xiao|hsiao|hiu|yaoyao/i.test(rawName)) return '女声';
  if (/yun|wanlung/i.test(rawName)) return '男声';
  return '中性';
}

function normalizeVoiceBaseName(name: string): string {
  const localePrefixMatch = name.match(/^zh-[A-Za-z-]+-([A-Za-z]+)Neural$/i);
  if (localePrefixMatch) return localePrefixMatch[1];

  const microsoftMatch = name.match(/Microsoft\s+([A-Za-z]+)\s+Online/i);
  if (microsoftMatch) return microsoftMatch[1];

  const neuralMatch = name.match(/([A-Za-z]+)Neural/i);
  if (neuralMatch) return neuralMatch[1];

  return name.replace(/^Microsoft\s+/i, '').trim();
}

export type ReaderVoiceDisplay = {
  isKnown: boolean;
  title: string;
  region: string;
  tone: string;
  detail: string;
  label: string;
};

export function formatReaderVoiceDisplay(name: string, locale = ''): ReaderVoiceDisplay {
  const baseName = normalizeVoiceBaseName(name);
  const known = VOICE_PROFILE_MAP[baseName];

  if (known) {
    const detail = `${known.region} · ${known.tone}`;
    return {
      isKnown: true,
      title: known.title,
      region: known.region,
      tone: known.tone,
      detail,
      label: `${known.title} · ${detail}`,
    };
  }

  const region = inferRegionFromLocale(`${name} ${locale}`);
  const gender = inferGenderFromName(name);
  const title = baseName || '系统音色';
  const detail = `${region}${gender === '中性' ? '音色' : gender} · 系统语音`;

  return {
    isKnown: false,
    title,
    region,
    tone: '系统语音',
    detail,
    label: `${title} · ${detail}`,
  };
}
