import type { StartupPlatformProfile } from '../types';

export type StartupPlatformProfileOption = StartupPlatformProfile;

export const STARTUP_PLATFORM_PROFILE_OPTIONS: Array<{
  label: string;
  value: StartupPlatformProfileOption;
  hint: string;
}> = [
  { label: '自动', value: 'auto', hint: '不额外强绑平台范式，按题材和指令生成' },
  { label: '番茄小说', value: 'fanqie', hint: '强调首屏冲突、快反馈、前三章追读率' },
  { label: '起点中文网', value: 'qidian', hint: '强调设定抓手、成长线和长篇潜力' },
];
