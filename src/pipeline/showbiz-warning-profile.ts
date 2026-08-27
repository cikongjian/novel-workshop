export const SHOWBIZ_WARNING_SIGNAL = {
  id: 'collapse-warning',
  patterns: [/(塌房预警|塌房|预警者|预警系统|避雷|截胡|爆红|塌房预警爆红)/] as RegExp[],
  requiredPayoffKeywords: ['预警', '避雷', '截胡', '翻红', '爆红', '直播', '热搜', '资源反抢'],
  requiredSceneKeywords: ['直播', '热搜', '录制现场', '试镜', '片场', '广告牌'],
  maxSuspenseShare: 0.28,
  directionHint: '小说卡片含有“塌房预警/爆红”信号，主回报必须是公开预警、避雷截胡和翻红起量，不能改写成黑料侦探文。',
  openingHint: '开头优先进入试镜、直播、热搜、录制现场这类公开战场，不要先私下查证黑料。',
  payoffHint: '前段至少兑现一次公开预警、资源截胡、避雷成功或声量上涨，不能只得到更多秘密。',
  antiDriftHint: '若篇幅主要用于深挖黑料、跟踪取证、偷拍视频、蹲守查证，说明已经偏成悬疑爆料文。',
};

export const SHOWBIZ_WARNING_BLUEPRINT = {
  profileId: 'fanqie-showbiz-warning-rise' as const,
  constitutionSignals: ['showbiz', 'collapse-warning'] as string[],
  mainPromise: '塌房预警驱动的娱乐圈翻红与资源截胡',
  secondaryPromises: ['公开预警', '避雷截胡', '直播起爆'] as string[],
  requiredPayoffKeywords: ['预警', '避雷', '截胡', '翻红', '爆红', '直播', '热搜', '资源反抢'] as string[],
  requiredSceneKeywords: ['直播', '热搜', '录制现场', '试镜', '片场', '广告牌'] as string[],
  suspenseDriftKeywords: ['真相', '秘密', '线索', '调查', '监控', '匿名', '幕后', '谜团', '证据', '查证', '深挖', '取证', '跟拍', '偷拍视频', '蹲守'] as string[],
  maxSuspenseShare: 0.28,
  directionHint: [
    '## 题材承诺合同（塌房预警爆红）',
    '- 前三章主驱动力必须是公开预警、避雷截胡、直播翻红、资源反抢，不是调查谁的黑料更深。',
    '- 系统给的是预警权和抢跑权，不是侦探证据包。黑料只能做背景压力，不能抢走主位。',
  ].join('\n'),
  openingHint: '开头优先把主角推上试镜、直播、热搜、录制现场等公开战场，不要先写潜伏、蹲守和查证。',
  payoffHint: '本章至少兑现一次预警后带来的可见收益：避雷成功、资源截胡、热搜上涨、直播起量、翻红迹象。',
  antiDriftHint: '如果正文主要在跟踪、偷拍视频、深挖证据、查证来源，说明已经偏成黑料侦探文，必须改回公开预警和流量博弈。',
};
