import type { TopicProfile } from './topic-profiles.js';

export const FANTASY_UPGRADE_TOPIC_PROFILE: TopicProfile = {
  id: 'fantasy-upgrade',
  priority: 108,
  genreFocus: 'upgrade',
  patterns: [/(fantasy-upgrade|玄幻|修仙|修真|灵根|秘境|宗门|金手指|境界|灵气|法宝|炼气|练气|筑基|修炼升级|战力升级)/i],
  requiredPayoffKeywords: ['突破', '破境', '升级', '觉醒', '机缘', '斩杀', '反杀', '碾压', '越级', '灵石', '灵药', '功法', '传承'],
  requiredSceneKeywords: ['宗门', '秘境', '擂台', '洞府', '丹房', '拍卖会', '坊市', '赌场', '灵根', '功法'],
  suspenseDriftKeywords: ['调查', '真相', '秘密', '线索', '幕后', '追查', '拼凑', '推理', '阴谋', '谜团', '来源'],
  maxSuspenseShare: 0.34,
  directionHint: '玄幻升级题材必须把资源、境界和战力变化写成当场可见的结果，并让对手或围观者承受结果。',
  openingHint: '开头优先进入被逐、追杀、资源争夺、修炼突破、擂台或秘境压力现场。',
  payoffHint: '本章至少兑现一次破境、夺资源、越级战斗、反杀或围观打脸。',
  antiDriftHint: '身世、幕后和来源只能作为升级压力，不能替代修炼、争夺和战斗。',
  preferredEndingFocus: ['下一名对手', '新的资源门槛', '境界代价', '限时争夺'],
  antiDelayRule: '资源、境界或对手一旦立起，就要尽快写出获取、突破或战斗结果。',
  startupHints: {
    title: '玄幻升级',
    directionHint: '首章必须让主角的境界、资源或战力发生可见变化，并让具名对手当场承担结果。',
    openingHint: '前 500 字进入被逐、追杀、修炼、资源争夺、擂台或秘境，不要先调查幕后。',
    payoffHint: '首章至少落地一次破境、夺资源、反杀、越级战斗或围观打脸。',
  },
  openingRules: [
    { dimension: 'goal', instruction: '开篇必须明确当前升级目标：破境、夺资源、杀对手、闯秘境或赢擂台至少一项。', priority: 104 },
    { dimension: 'obstacle', instruction: '阻碍必须来自境界压制、伤势、追兵、资源不足、宗门规则或具名对手。', priority: 105 },
    { dimension: 'early-payoff', instruction: '前段必须出现破境、资源到账、对手受创或围观态度变化，不能只解释功法和身世。', priority: 106 },
  ],
  startupBlocks: [
    { title: '生存与升级压力先落地', summaryTemplate: '开场把主角放进被逐、追杀、资源短缺、擂台或秘境压力，让当下升级目标立即成立。{anchor0}', location: '宗门 / 坊市 / 擂台 / 秘境入口', tension: 9 },
    { title: '用实力换结果', summaryTemplate: '主角必须围绕{sceneLabel}修炼、争夺或战斗，并让境界、资源或对手状态发生变化。{anchor1}', location: '修炼地 / 争夺现场 / 战场', tension: 9 },
    { title: '结果改变身份位置', summaryTemplate: '把“{payoffLabel}”落成破境、反杀、资源到手或围观改口，再抛出更高门槛。{anchor2}', location: '公开兑现现场', tension: 8 },
  ],
  skillSignals: ['fantasy'],
  genreAliases: ['fantasy', 'xuanhuan', 'xianxia', 'xiuzhen'],
  baselineGenre: 'xuanhuan',
};
