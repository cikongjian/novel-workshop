/**
 * 爽点 DNA 测试 —— 计分逻辑 v2
 * 随机抽 8 题 + 每题从 8 选项抽 4 + 权重 ±20% 抖动 + 结果分层
 */
import { ref, computed } from 'vue';
import {
  pickRandomQuestions,
  pickRandomOptions,
  DNA_DIMENSIONS,
  QUIZ_QUESTIONS_FULL,
  type QuizOption,
  type QuizQuestion,
} from '../data/quiz-questions';

export interface DnaDimension {
  key: string;
  label: string;
  value: number;
}

export interface DnaResult {
  dims: DnaDimension[];
  primary: { key: string; label: string; value: number };
  secondary: { key: string; label: string; value: number } | null;
  anti: { key: string; label: string; value: number };
  hiddenTraits: string[];
  insight: string;
  topLabel: string;
  topDesc: string;
  shareCardData: { text: string; novelTitle: string; authorName: string };
}

const LABEL_MAP: Record<string, { label: string; desc: string }> = {
  'fantasy-upgrade': { label: '玄幻升级型', desc: '你骨子里渴望以实力碾压一切，境界突破的爽感无可替代' },
  showbiz: { label: '逆袭顶流型', desc: '聚光灯下的复仇最让你上头，娱乐圈文是你的本命' },
  'collapse-warning': { label: '塌房预警型', desc: '看着对手一步步崩塌让你欲罢不能，你是吃瓜战神' },
  rebirth: { label: '重生改命型', desc: '带着记忆重来一次的魅力无法抗拒，你是先知型读者' },
  faceslap: { label: '打脸反杀型', desc: '当面打脸的爽感无与伦比，你最爱看反派排队道歉' },
  sweet: { label: '爽甜拉扯型', desc: '傲娇嘴硬×暗戳戳偏爱，你是 CP 头子兼糖分摄取者' },
  'female-career': { label: '大女主搞事业', desc: '独立女性叱咤风云的爽感让你上头，搞钱比恋爱更香' },
  'shame-system': { label: '社死欢乐型', desc: '看别人社死就是你的快乐源泉，你是乐子人本乐' },
};

const HIDDEN_TRAIT_CHECKS: Array<{ key: string; label: string; test: (answers: number[], questions: QuizQuestion[]) => boolean }> = [
  {
    key: 'masochist', label: '虐文体质',
    test: (answers, qs) => {
      // 总是选最惨的开局
      let count = 0;
      for (let i = 0; i < answers.length; i++) {
        const q = qs[i]; const opt = q?.options[answers[i]];
        if (opt?.weights.rebirth && opt.weights.rebirth >= 3) count++;
      }
      return count >= 3;
    },
  },
  {
    key: 'cheat-addict', label: '金手指成瘾',
    test: (answers, qs) => {
      let count = 0;
      for (let i = 0; i < answers.length; i++) {
        const q = qs[i]; const opt = q?.options[answers[i]];
        if (opt?.weights['fantasy-upgrade'] && opt.weights['fantasy-upgrade'] >= 3) count++;
      }
      return count >= 3;
    },
  },
  {
    key: 'harem-lover', label: '修罗场爱好者',
    test: (answers, qs) => {
      let count = 0;
      for (let i = 0; i < answers.length; i++) {
        const q = qs[i]; const opt = q?.options[answers[i]];
        if (opt?.weights.sweet && opt.weights.sweet >= 3) count++;
      }
      return count >= 4;
    },
  },
  {
    key: 'revenge-seeker', label: '复仇执念',
    test: (answers, qs) => {
      let count = 0;
      for (let i = 0; i < answers.length; i++) {
        const q = qs[i]; const opt = q?.options[answers[i]];
        if (opt?.weights.faceslap && opt.weights.faceslap >= 3) count++;
      }
      return count >= 3;
    },
  },
  {
    key: 'anti-social', label: '社恐逆袭',
    test: (answers, qs) => {
      let count = 0;
      for (let i = 0; i < answers.length; i++) {
        const q = qs[i]; const opt = q?.options[answers[i]];
        if (opt?.weights['shame-system'] && opt.weights['shame-system'] >= 3) count++;
      }
      return count >= 3;
    },
  },
];

/** 权重抖动 ±20% */
function jitter(w: number): number {
  return w * (0.8 + Math.random() * 0.4);
}

function generateInsight(primary: DnaDimension, secondary: DnaDimension | null, anti: DnaDimension): string {
  const lines: string[] = [];
  const p = LABEL_MAP[primary.key];
  if (p) lines.push(`你的核心爽点来自${p.label}——${p.desc}。`);
  if (secondary && secondary.value >= 50) {
    const s = LABEL_MAP[secondary.key];
    if (s) lines.push(`同时你身上有${secondary.value}%的${s.label}成分，这让你的口味更加复杂。`);
  }
  const a = LABEL_MAP[anti.key];
  if (a) lines.push(`你最不适合看${a.label}类作品，建议避雷。`);
  return lines.join(' ');
}

export function useShuangwenDna() {
  const currentStep = ref(0);
  const questions = ref<QuizQuestion[]>([]);
  const displayOptions = ref<QuizOption[][]>([]);
  const answers = ref<number[]>([]);
  const result = ref<DnaResult | null>(null);

  const totalQuestions = 8;
  const progress = computed(() => Math.round((currentStep.value / totalQuestions) * 100));

  function init() {
    const picked = pickRandomQuestions();
    const opts = picked.map(q => pickRandomOptions(q.options));
    questions.value = picked;
    displayOptions.value = opts;
    answers.value = new Array(totalQuestions).fill(-1);
    currentStep.value = 0;
    result.value = null;
  }

  function selectAnswer(optionIdx: number) {
    answers.value[currentStep.value] = optionIdx;
    if (currentStep.value < totalQuestions - 1) {
      currentStep.value++;
    } else {
      calcResult();
    }
  }

  function goBack() {
    if (currentStep.value > 0) currentStep.value--;
  }

  function calcResult() {
    const scores: Record<string, number> = {};
    for (const dim of DNA_DIMENSIONS) scores[dim.key] = 0;

    for (let i = 0; i < totalQuestions; i++) {
      const ansIdx = answers.value[i];
      if (ansIdx < 0) continue;
      const opts = displayOptions.value[i];
      if (!opts || !opts[ansIdx]) continue;
      for (const [key, w] of Object.entries(opts[ansIdx].weights)) {
        scores[key] = (scores[key] ?? 0) + jitter(w ?? 0);
      }
    }

    const maxRaw = Math.max(...Object.values(scores), 1);
    const dims: DnaDimension[] = DNA_DIMENSIONS.map(d => ({
      key: d.key,
      label: d.label,
      value: Math.round((scores[d.key] ?? 0) / maxRaw * 100),
    }));

    const sorted = [...dims].sort((a, b) => b.value - a.value);
    const primary = sorted[0];
    const secondary = sorted[1]?.value >= 50 ? sorted[1] : null;
    const anti = sorted[sorted.length - 1];

    const hiddenTraits = HIDDEN_TRAIT_CHECKS
      .filter(h => h.test(answers.value, questions.value))
      .map(h => h.label);

    const info = LABEL_MAP[primary.key] ?? { label: primary.label, desc: '你的爽点独一无二' };

    result.value = {
      dims,
      primary: { ...primary },
      secondary: secondary ? { ...secondary } : null,
      anti: { ...anti },
      hiddenTraits,
      insight: generateInsight(primary, secondary, anti),
      topLabel: info.label,
      topDesc: info.desc,
      shareCardData: {
        text: `我的爽点DNA是【${info.label}】—— ${info.desc}`,
        novelTitle: '爽点DNA测试',
        authorName: '我',
      },
    };
  }

  function reset() { init(); }

  init();

  return {
    currentStep, questions, displayOptions, answers, result,
    totalQuestions, progress,
    selectAnswer, goBack, reset, init,
  };
}
