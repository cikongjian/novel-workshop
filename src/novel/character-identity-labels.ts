import type {
  CharacterIdentityLabel,
  CharacterProfile,
  CharacterRole,
} from './types.js';

const ROLE_LABELS: Record<CharacterRole, string> = {
  protagonist: '主角',
  deuteragonist: '副主角',
  antagonist: '反派',
  rival: '宿敌',
  love_interest: '感情线核心',
  mentor: '导师',
  ally: '关键盟友',
  faction_leader: '势力核心',
  supporting: '重要配角',
  family: '亲友核心',
  comic_relief: '气氛担当',
  minor: '次要角色',
};

const RELATION_LABELS: Record<string, string> = {
  family: '亲缘关系',
  spouse: '伴侣关系',
  sibling: '手足关系',
  parent: '亲子关系',
  lover: '恋爱关系',
  crush: '暗恋关系',
  friend: '挚友关系',
  childhood: '青梅竹马',
  sworn: '结义关系',
  comrade: '战友关系',
  ally: '同盟关系',
  partner: '搭档关系',
  mentor: '师承关系',
  subordinate: '上下级关系',
  protector: '守护关系',
  rival: '竞争关系',
  enemy: '敌对关系',
  betrayer: '背叛关系',
  nemesis: '宿敌关系',
};

function normalizeLabel(value: unknown, maxLength = 12): string {
  if (typeof value !== 'string') return '';
  const label = value.trim().replace(/\s+/gu, ' ');
  return label.length > 0 && label.length <= maxLength ? label : '';
}

function derivedLabel(params: {
  key: string;
  label: string;
  category: CharacterIdentityLabel['category'];
  confidence: number;
}): CharacterIdentityLabel {
  return {
    ...params,
    source: 'derived',
  };
}

/**
 * 从已经确认的结构化字段生成身份标签，不从名字或自由文本猜测身份。
 * AI/用户标签会被保留，自动标签则按稳定 key 重建。
 */
export function projectCharacterIdentityLabels(
  character: CharacterProfile,
): CharacterIdentityLabel[] {
  const projected: CharacterIdentityLabel[] = [];
  const add = (label: CharacterIdentityLabel) => {
    if (!projected.some(item => item.key === label.key)) projected.push(label);
  };

  add(derivedLabel({
    key: `role:${character.role}`,
    label: ROLE_LABELS[character.role],
    category: 'structural',
    confidence: 1,
  }));

  const socialValues = [
    ['position', normalizeLabel(character.position)],
    ['faction', normalizeLabel(character.socialIdentity?.faction)],
    ['class', normalizeLabel(character.socialIdentity?.socialClass)],
    ['reputation', normalizeLabel(character.socialIdentity?.reputation)],
  ] as const;
  for (const [kind, label] of socialValues) {
    if (!label) continue;
    add(derivedLabel({
      key: `social:${kind}:${label}`,
      label,
      category: 'social',
      confidence: 0.95,
    }));
  }

  for (const trait of character.personalityTraits ?? []) {
    const label = normalizeLabel(trait, 8);
    if (!label) continue;
    add(derivedLabel({
      key: `trait:${label}`,
      label,
      category: 'reader',
      confidence: 0.85,
    }));
  }

  for (const relationship of character.relationships ?? []) {
    const label = RELATION_LABELS[relationship.type];
    if (!label) continue;
    add(derivedLabel({
      key: `relationship:${relationship.type}`,
      label,
      category: 'relationship',
      confidence: 0.9,
    }));
  }

  if (character.status === 'dead' || character.status === 'exited') {
    add(derivedLabel({
      key: `status:${character.status}`,
      label: character.status === 'dead' ? '已死亡' : '已退场',
      category: 'growth',
      confidence: 1,
    }));
  }

  const preserved = (character.identityLabels ?? []).filter(label => (
    label.source !== 'derived' || label.userLocked
  ));
  const byKey = new Map(projected.map(label => [label.key, label]));
  for (const label of preserved) byKey.set(label.key, label);
  return [...byKey.values()];
}
