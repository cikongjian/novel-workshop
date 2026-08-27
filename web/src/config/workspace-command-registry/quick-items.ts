import type { OperationCenterQuickAction, OperationCenterQuickBuildContext } from './shared';

const OPERATION_CENTER_QUICK_ORDER = [
  'open-revise',
  'open-command-palette',
] as const;

const OPERATION_CENTER_QUICK_META: Record<
  (typeof OPERATION_CENTER_QUICK_ORDER)[number],
  Omit<OperationCenterQuickAction, 'id' | 'disabled'>
> = {
  'open-revise': {
    label: '修订当前章节（Alt+R）',
    keywords: ['修订', '重写', 'alt+r'],
    shortcut: 'Alt+R',
  },
  'open-command-palette': {
    label: '打开命令面板（Ctrl+K）',
    keywords: ['命令', '快捷键', 'ctrl+k'],
    shortcut: 'Ctrl+K',
  },
};

function resolveOperationCenterQuickDisabled(
  id: (typeof OPERATION_CENTER_QUICK_ORDER)[number],
  context: OperationCenterQuickBuildContext,
): boolean | undefined {
  if (id === 'open-revise') {
    return context.isGenerating || !context.hasCurrentChapterContent;
  }
  return undefined;
}

export function buildOperationCenterQuickItems(
  context: OperationCenterQuickBuildContext,
): OperationCenterQuickAction[] {
  return OPERATION_CENTER_QUICK_ORDER.map((id) => ({
    id,
    ...OPERATION_CENTER_QUICK_META[id],
    disabled: resolveOperationCenterQuickDisabled(id, context),
  }));
}
