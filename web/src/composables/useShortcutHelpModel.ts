import { computed, type ComputedRef, type Ref } from 'vue';
import {
  WORKSPACE_SHORTCUT_HELP_BUILTIN_COMMAND_IDS,
  WORKSPACE_SHORTCUT_HELP_GROUPS,
} from '../config/workspace-command-registry';

export type ShortcutHelpItem = {
  key: string;
  action: string;
  description: string;
  commandId?: string;
};

export type ShortcutHelpGroup = {
  id: string;
  label: string;
  items: ShortcutHelpItem[];
};

type WorkspaceCommandStateItem = {
  id: string;
  disabled?: boolean;
  subtitle?: string;
};

const BUILTIN_SHORTCUT_COMMANDS = new Set<string>(WORKSPACE_SHORTCUT_HELP_BUILTIN_COMMAND_IDS);

function shortcutHelpMatches(item: ShortcutHelpItem, query: string): boolean {
  if (!query) return true;
  const normalized = query.toLowerCase();
  return item.key.toLowerCase().includes(normalized)
    || item.action.toLowerCase().includes(normalized)
    || item.description.toLowerCase().includes(normalized);
}

export function useShortcutHelpModel(options: {
  query: Ref<string>;
  workspaceCommandItems: ComputedRef<WorkspaceCommandStateItem[]>;
}) {
  const shortcutHelpGroups = computed<ShortcutHelpGroup[]>(() => WORKSPACE_SHORTCUT_HELP_GROUPS);

  const shortcutChipTooltipText = computed(() => (
    shortcutHelpGroups.value
      .flatMap(group => group.items.map(item => `${item.key} ${item.action}`))
      .join(' · ')
  ));

  const shortcutHelpFilteredGroups = computed(() => {
    const normalizedQuery = options.query.value.trim().toLowerCase();
    return shortcutHelpGroups.value
      .map(group => ({
        ...group,
        items: group.items.filter(item => shortcutHelpMatches(item, normalizedQuery)),
      }))
      .filter(group => group.items.length > 0);
  });

  const workspaceCommandStateMap = computed(() => (
    new Map(options.workspaceCommandItems.value.map(item => [item.id, item]))
  ));

  function isShortcutHelpActionDisabled(commandId?: string): boolean {
    if (!commandId) return true;
    if (BUILTIN_SHORTCUT_COMMANDS.has(commandId)) return false;
    return workspaceCommandStateMap.value.get(commandId)?.disabled ?? false;
  }

  function resolveShortcutHelpActionHint(item: ShortcutHelpItem): string {
    if (!item.commandId) return item.description;
    if (BUILTIN_SHORTCUT_COMMANDS.has(item.commandId)) return item.description;
    const state = workspaceCommandStateMap.value.get(item.commandId);
    if (!state) return item.description;
    return state.subtitle || item.description;
  }

  return {
    shortcutChipTooltipText,
    shortcutHelpFilteredGroups,
    isShortcutHelpActionDisabled,
    resolveShortcutHelpActionHint,
  };
}
