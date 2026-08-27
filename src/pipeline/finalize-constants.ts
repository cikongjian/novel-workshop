/**
 * Finalize Pipeline Constants
 *
 * Contains all constants used by the finalize-pipeline modules.
 */

/** ---MERGE_RESULT--- 分隔符 */
export const MERGE_SEPARATOR = '---MERGE_RESULT---';

/** 伏笔优先级排序 */
export const FORESHADOWING_PRIORITY_RANK: Record<'high' | 'medium' | 'low', number> = {
    high: 3,
    medium: 2,
    low: 1,
};

/** 预编译的正则表达式 */
export const OUTLINE_CHARACTER_LINE_RE = /出场角色[^\n：:]{0,20}[：:]\s*([^\n]+)/g;
export const INLINE_SPEAKER_MARKER_RE = /[\(\uFF08]\s*[#\uFF03]\s*([^()\uFF08\uFF09\n]+?)\s*[\)\uFF09]/g;
export const CHARACTER_NAME_SPLIT_RE = /[、，,\/\\\s和与及]+/;
export const LEADING_CHARACTER_QUANTIFIER_RE = /^(?:一位|一名|一个|一只|某位|某名|某个|某只)/;

/** 非角色名称标记 */
export const NON_CHARACTER_TOKENS = new Set([
    '角色',
    '角色群像',
    '主角',
    '配角',
    '反派',
    '路人',
    '无',
    '未知',
    '系统',
    '宿主',
    '旁白',
    '提示音',
    '广播',
    '感染者',
    '幸存者',
    '怪物',
    '感染者',
    '蹒跚者',
]);

/** 默认引导角色状态生成器 */
export const DEFAULT_BOOTSTRAP_CHARACTER_STATE = (chapterNumber: number): string => `[第${chapterNumber}章] 初次出场`;

/** 序列化裁剪常量 */
export const MAX_CHARACTERS_FOR_AGENT = 50;
export const MAX_WORLD_ENTRIES_FOR_AGENT = 30;
export const CHARACTER_ROLE_PRIORITY: Record<string, number> = {
    protagonist: 12,
    deuteragonist: 11,
    antagonist: 10,
    rival: 9,
    love_interest: 8,
    mentor: 7,
    ally: 6,
    faction_leader: 5,
    supporting: 4,
    family: 3,
    comic_relief: 2,
    minor: 1,
};

/** 预编译的梳理触发正则 */
export const CURATION_FACTION_RE = /门派|宗门|帮派|势力|组织|联盟|王国|帝国/g;
export const CURATION_POWER_RE = /修炼|突破|境界|法术|功法|灵力|真气/g;
export const CURATION_CULTURE_RE = /风俗|习俗|节日|仪式|传统|信仰/g;
export const CURATION_HISTORY_RE = /历史|传说|古代|先祖|上古/g;
