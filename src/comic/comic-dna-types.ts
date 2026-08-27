/**
 * 角色视觉 DNA——结构化的角色视觉身份档案。
 * 立绘生成和漫画出图共享此 DNA，从源头保证一致性。
 * 详见 docs/角色DNA一致性方案.md
 */

/** 面部特征（骨骼级描述，gpt-image-2 最需要精确约束的部分） */
export type DNAFace = {
  shape: string;
  eyes: string;
  eyebrows: string;
  nose: string;
  mouth: string;
  marks: string;
};

export type DNAHair = {
  color: string;
  style: string;
  feature: string;
};

export type DNABody = {
  build: string;
  height: string;
  posture: string;
};

export type DNAOutfit = {
  main: string;
  accessories: string;
  colors: string;
};

/** 预生成英文 prompt 片段（立绘和漫画共享，不每次重新拼） */
export type DNAPromptFragment = {
  face: string;
  hair: string;
  outfit: string;
  body: string;
  /** 完整拼接（立绘用，含 artStyle） */
  full: string;
  /** 锚点拼接（漫画用，不含 artStyle，含一致性约束） */
  anchor: string;
  /** 多角度变体（分镜师选镜头后用对应角度） */
  frontal: string;
  profile: string;
  distant: string;
};

export type CharacterDNA = {
  characterId: string;
  novelId: string;
  name: string;
  /** 性别（显式存储，避免英文 prompt 依赖 AI 推断） */
  gender: string;
  generatedAt: string;
  version: number;

  face: DNAFace;
  hair: DNAHair;
  body: DNABody;
  outfit: DNAOutfit;
  /** 标志性视觉锚点（最强辨识度，每格必重复） */
  signatureAnchors: string[];
  /** 全局画风锚点（所有出图统一画风） */
  artStyle: string;
  /** 预生成英文 prompt 片段 */
  promptFragment: DNAPromptFragment;
  /** 多角度参考图路径（相对 novel 目录） */
  referenceImages: {
    frontal?: string;
    profile?: string;
    full?: string;
  };
};
