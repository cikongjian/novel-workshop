/**
 * 漫画生成管线的数据结构（3 Agent 串行管线的输入/输出契约）。
 * 详见 docs/漫画生成管线设计.md §3。
 */

/** 剧情点（①剧情挖掘师输出，②分镜师输入） */
export type ComicBeat = {
  beatIndex: number;
  title: string;
  chapterLocation: string;
  event: string;
  characters: string[];
  emotionIntensity: number;
  visualPotential: number;
  reason: string;
};

/** 分镜场景中的角色状态 */
export type ComicSceneCharacter = {
  name: string;
  action: string;
  expression: string;
};

export type ComicPanelRole =
  | 'establish'
  | 'action'
  | 'reaction'
  | 'detail'
  | 'conflict'
  | 'reveal'
  | 'cliffhanger';

export type ComicLayoutTemplate =
  | 'mobile-3'
  | 'hero-plus-2'
  | 'reaction-strip'
  | 'cinematic-wide';

export type ComicPanelTransition =
  | 'cut'
  | 'match-action'
  | 'reaction'
  | 'time-jump'
  | 'impact';

export type ComicBubblePlacement =
  | 'top-left'
  | 'top-right'
  | 'middle-left'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-right';

/** 分镜场景（②分镜师输出，作者勾选单位，③prompt 工程师输入） */
export type ComicScene = {
  sceneId: string;
  /** 漫画页序号。新脚本为 1-2；历史数据可为空，前端按每 3 格兜底分组。 */
  pageIndex?: number;
  /** 页内格序。新脚本为 1-3；历史数据可为空。 */
  panelIndexInPage?: number;
  /** 本格叙事职能，决定它是建场、动作、反应、细节还是钩子。 */
  panelRole?: ComicPanelRole;
  /** 本页移动端组版模板。 */
  layoutTemplate?: ComicLayoutTemplate;
  /** 与上一格的衔接方式，用于避免一组孤立场景图。 */
  transitionFromPrevious?: ComicPanelTransition;
  /** 对话气泡建议位置。文字由前端叠加，不进入图片。 */
  bubblePlacement?: ComicBubblePlacement;
  /** 简短音效字，由前端叠加；无则空字符串。 */
  sfx?: string;
  beatIndex: number;
  title: string;
  characters: ComicSceneCharacter[];
  event: string;
  dialogue: string;
  narration: string;
  shotType: 'wide' | 'medium' | 'closeup' | 'insert';
  cameraAngle: 'eye-level' | 'low-angle' | 'high-angle' | 'over-shoulder';
  composition: 'rule-of-thirds' | 'diagonal' | 'center';
  shotReason: string;
  emotion: string;
  visualDescription: string;
  promptDraft: string;
};

/** prompt 工程师输出（③，对应一个选中场景） */
export type ComicRenderedPrompt = {
  sceneId: string;
  finalPrompt: string;
};

/** 场景列表（落盘 comics/chapter-N/scene-list.json） */
export type ComicSceneList = {
  novelId: string;
  chapterNumber: number;
  generatedAt: string;
  beats: ComicBeat[];
  scenes: ComicScene[];
};
