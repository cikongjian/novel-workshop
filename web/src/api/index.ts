// Barrel re-export — 所有域模块的统一出口
// 消费者可继续使用 `import * as api from '../api'` 或 `import { xxx } from '../api'`

export * from './novels';
export * from './chapters';
export * from './characters';
export * from './world';
export * from './outline';
export * from './generate';
export * from './inline-ai';
export * from './adaptation';
export * from './settings';
export * from './homepage';
export * from './skills';
export * from './story-state';
export * from './tts';
export * from './analytics';
export * from './memory';
export * from './batch-control';
export * from './rebirth';
export * from './style';
export * from './cost';
export * from './fact-graph';
export * from './plot-branches';
export * from './portraits';
export * from './anchors';
export * from './universes';
export * from './series';
export * from './trends';
export * from './publishing';
export * from './sync';
export * from './billing';
export * from './auth';
export * from './bookstore';
export * from './referral';
export * from './system';
export * from './downloads';
export * from './user-api';
export * from './short-story';
export * from './logs';
export * from './compliance';

// 默认导出 http 实例供组件直接使用
export { http as default } from './http';
