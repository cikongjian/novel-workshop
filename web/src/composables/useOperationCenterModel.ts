import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import {
  OPERATION_CENTER_GROUP_META,
  WORKSPACE_COMMAND_ALIAS_MAP,
  WORKSPACE_COMMAND_KEYWORD_HINT_MAP,
  WORKSPACE_COMMAND_SHORTCUT_MAP,
  WORKSPACE_OPERATION_CENTER_GROUP_MAP,
  type OperationCenterGroupId as WorkspaceOperationCenterGroupId,
} from '../config/workspace-command-registry';
import { matchCommandQuery, normalizeCommandQuery } from '../utils/command-search';

export type OperationCenterSourceAction = {
  id: string;
  label: string;
  disabled?: boolean;
};

export type QuickOperationCenterItem = {
  id: string;
  label: string;
  disabled?: boolean;
  keywords?: string[];
  shortcut?: string;
};

export type OperationCenterGroupId = WorkspaceOperationCenterGroupId;

export type OperationCenterItem = {
  id: string;
  label: string;
  disabled?: boolean;
  group: OperationCenterGroupId;
  keywords?: string[];
  shortcut?: string;
};

export type OperationCenterGroup = {
  id: string;
  label: string;
  items: OperationCenterItem[];
};

function parseIdList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string');
  } catch {
    return [];
  }
}

function operationCenterItemMatches(item: OperationCenterItem, query: string): boolean {
  return matchCommandQuery(query, [
    item.label,
    item.shortcut,
    ...(item.keywords ?? []),
  ]);
}

export function useOperationCenterModel(options: {
  toolbarActions: ComputedRef<OperationCenterSourceAction[]>;
  quickItems: ComputedRef<QuickOperationCenterItem[]>;
  query: Ref<string>;
  pinnedStorageKey: string;
  recentStorageKey: string;
  recentLimit: number;
}) {
  const pinnedOperationCenterIds = ref<string[]>([]);
  const recentOperationCenterIds = ref<string[]>([]);

  const operationCenterPinnedSet = computed(() => new Set(pinnedOperationCenterIds.value));

  const operationCenterItems = computed(() => {
    const quickEntries = options.quickItems.value.map((item) => ({
      id: item.id,
      label: item.label,
      disabled: item.disabled,
      group: 'quick' as const,
      keywords: [...(item.keywords ?? []), ...(WORKSPACE_COMMAND_ALIAS_MAP[item.id] ?? [])],
      shortcut: item.shortcut || WORKSPACE_COMMAND_SHORTCUT_MAP[item.id],
    })) satisfies OperationCenterItem[];

    const mappedToolbarItems = options.toolbarActions.value
      .map((action): OperationCenterItem | null => {
        const group = WORKSPACE_OPERATION_CENTER_GROUP_MAP[action.id];
        if (!group) return null;
        return {
          id: action.id,
          label: action.label,
          disabled: action.disabled,
          group,
          keywords: [...(WORKSPACE_COMMAND_KEYWORD_HINT_MAP[action.id] ?? []), ...(WORKSPACE_COMMAND_ALIAS_MAP[action.id] ?? [])],
          shortcut: WORKSPACE_COMMAND_SHORTCUT_MAP[action.id],
        };
      })
      .filter((item): item is OperationCenterItem => item !== null);

    return [...quickEntries, ...mappedToolbarItems] as OperationCenterItem[];
  });

  function persistOperationCenterPreferences() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(options.pinnedStorageKey, JSON.stringify(pinnedOperationCenterIds.value));
      localStorage.setItem(options.recentStorageKey, JSON.stringify(recentOperationCenterIds.value));
    } catch {
      // ignore
    }
  }

  function normalizeOperationCenterPreferences() {
    const availableIds = new Set(operationCenterItems.value.map(item => item.id));
    const unique = (ids: string[]) => Array.from(new Set(ids)).filter(id => availableIds.has(id));
    pinnedOperationCenterIds.value = unique(pinnedOperationCenterIds.value);
    recentOperationCenterIds.value = unique(recentOperationCenterIds.value)
      .filter(id => !pinnedOperationCenterIds.value.includes(id))
      .slice(0, options.recentLimit);
  }

  function loadOperationCenterPreferences() {
    if (typeof window === 'undefined') return;
    pinnedOperationCenterIds.value = parseIdList(localStorage.getItem(options.pinnedStorageKey));
    recentOperationCenterIds.value = parseIdList(localStorage.getItem(options.recentStorageKey));
    normalizeOperationCenterPreferences();
  }

  function recordOperationCenterUsage(id: string) {
    if (operationCenterPinnedSet.value.has(id)) return;
    recentOperationCenterIds.value = [id, ...recentOperationCenterIds.value.filter(existingId => existingId !== id)]
      .slice(0, options.recentLimit);
    persistOperationCenterPreferences();
  }

  function toggleOperationCenterPin(id: string, event?: MouseEvent) {
    event?.stopPropagation();
    if (operationCenterPinnedSet.value.has(id)) {
      pinnedOperationCenterIds.value = pinnedOperationCenterIds.value.filter(existingId => existingId !== id);
    } else {
      pinnedOperationCenterIds.value = [id, ...pinnedOperationCenterIds.value];
    }
    normalizeOperationCenterPreferences();
    persistOperationCenterPreferences();
  }

  const operationCenterGroups = computed<OperationCenterGroup[]>(() => {
    const query = normalizeCommandQuery(options.query.value);
    const itemMap = new Map(operationCenterItems.value.map(item => [item.id, item]));

    const pinnedItems = pinnedOperationCenterIds.value
      .map(id => itemMap.get(id))
      .filter((item): item is OperationCenterItem => Boolean(item))
      .filter(item => operationCenterItemMatches(item, query));
    const pinnedSet = new Set(pinnedItems.map(item => item.id));

    const recentItems = recentOperationCenterIds.value
      .map(id => itemMap.get(id))
      .filter((item): item is OperationCenterItem => Boolean(item))
      .filter(item => !pinnedSet.has(item.id))
      .filter(item => operationCenterItemMatches(item, query));

    const hiddenSet = new Set([...pinnedSet, ...recentItems.map(item => item.id)]);
    const normalGroups = OPERATION_CENTER_GROUP_META
      .map((group) => {
        const items = operationCenterItems.value.filter((item) => {
          if (hiddenSet.has(item.id)) return false;
          if (item.group !== group.id) return false;
          return operationCenterItemMatches(item, query);
        });
        return {
          ...group,
          items,
        };
      })
      .filter(group => group.items.length > 0);

    return [
      ...(pinnedItems.length > 0 ? [{ id: 'pinned', label: '置顶命令', items: pinnedItems }] : []),
      ...(recentItems.length > 0 ? [{ id: 'recent', label: '最近使用', items: recentItems }] : []),
      ...normalGroups,
    ];
  });

  const operationCenterEnabledItems = computed(() => (
    operationCenterGroups.value.flatMap(group => group.items).filter(item => !item.disabled)
  ));

  watch(operationCenterItems, () => {
    const beforePinned = JSON.stringify(pinnedOperationCenterIds.value);
    const beforeRecent = JSON.stringify(recentOperationCenterIds.value);
    normalizeOperationCenterPreferences();
    if (
      beforePinned !== JSON.stringify(pinnedOperationCenterIds.value)
      || beforeRecent !== JSON.stringify(recentOperationCenterIds.value)
    ) {
      persistOperationCenterPreferences();
    }
  });

  return {
    operationCenterPinnedSet,
    operationCenterItems,
    operationCenterGroups,
    operationCenterEnabledItems,
    loadOperationCenterPreferences,
    normalizeOperationCenterPreferences,
    persistOperationCenterPreferences,
    recordOperationCenterUsage,
    toggleOperationCenterPin,
  };
}
