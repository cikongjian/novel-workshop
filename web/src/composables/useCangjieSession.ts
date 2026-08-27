import { computed, ref, watch } from 'vue';
import {
  CANGJIE_CHECKLIST_GROUP_ORDER,
  type CangjieChecklistGroup,
  CangjieChatMessage,
  CangjieChecklistItem,
  CangjieConversationTurn,
} from '../api/cangjie';

export const CANGJIE_SESSION_STORAGE_KEY = 'mobile:cangjie:session:v1';

export type CangjieLocalSession = {
  version: 1;
  messages: CangjieChatMessage[];
  organizedChecklist?: CangjieChecklistItem[];
  selectedItemIds?: string[];
  lastUpdatedAt: string;
};

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function createMessageId(role: CangjieConversationTurn['role']): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `cangjie-${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeMessage(raw: unknown): CangjieChatMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Partial<CangjieChatMessage>;
  if (record.role !== 'user' && record.role !== 'assistant') return null;
  const content = typeof record.content === 'string' ? record.content.trim() : '';
  if (!content) return null;
  return {
    id: typeof record.id === 'string' && record.id ? record.id : createMessageId(record.role),
    role: record.role,
    content,
    createdAt: typeof record.createdAt === 'string' && record.createdAt
      ? record.createdAt
      : new Date().toISOString(),
  };
}

const CHECKLIST_GROUPS = new Set<CangjieChecklistGroup>(CANGJIE_CHECKLIST_GROUP_ORDER);

function isChecklistGroup(value: unknown): value is CangjieChecklistGroup {
  return typeof value === 'string' && CHECKLIST_GROUPS.has(value as CangjieChecklistGroup);
}

function normalizeChecklistItem(raw: unknown, selectedIds?: string[]): CangjieChecklistItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Partial<CangjieChecklistItem>;
  if (!record.id || !isChecklistGroup(record.group) || !record.title || !record.content) return null;
  const selectedSet = selectedIds ? new Set(selectedIds) : null;
  return {
    id: String(record.id),
    group: record.group,
    title: String(record.title).trim(),
    content: String(record.content).trim(),
    selected: selectedSet ? selectedSet.has(String(record.id)) : record.selected !== false,
  };
}

function readSession(): CangjieLocalSession | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(CANGJIE_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CangjieLocalSession>;
    if (parsed.version !== 1) return null;
    const selectedItemIds = Array.isArray(parsed.selectedItemIds)
      ? parsed.selectedItemIds.filter((item): item is string => typeof item === 'string')
      : undefined;
    return {
      version: 1,
      messages: Array.isArray(parsed.messages)
        ? parsed.messages.map(normalizeMessage).filter((item): item is CangjieChatMessage => Boolean(item))
        : [],
      organizedChecklist: Array.isArray(parsed.organizedChecklist)
        ? parsed.organizedChecklist
            .map(item => normalizeChecklistItem(item, selectedItemIds))
            .filter((item): item is CangjieChecklistItem => Boolean(item))
        : [],
      selectedItemIds,
      lastUpdatedAt: typeof parsed.lastUpdatedAt === 'string' ? parsed.lastUpdatedAt : '',
    };
  } catch {
    return null;
  }
}

export function useCangjieSession() {
  const messages = ref<CangjieChatMessage[]>([]);
  const organizedChecklist = ref<CangjieChecklistItem[]>([]);
  const selectedItemIds = ref<string[]>([]);
  const lastUpdatedAt = ref('');
  const hydrated = ref(false);

  function syncSelectedIds() {
    selectedItemIds.value = organizedChecklist.value
      .filter(item => item.selected)
      .map(item => item.id);
  }

  function saveSession() {
    if (!hydrated.value || !canUseStorage()) return;
    const now = new Date().toISOString();
    syncSelectedIds();
    lastUpdatedAt.value = now;
    const snapshot: CangjieLocalSession = {
      version: 1,
      messages: messages.value,
      organizedChecklist: organizedChecklist.value,
      selectedItemIds: selectedItemIds.value,
      lastUpdatedAt: now,
    };
    window.localStorage.setItem(CANGJIE_SESSION_STORAGE_KEY, JSON.stringify(snapshot));
  }

  function hydrateSession() {
    const saved = readSession();
    messages.value = saved?.messages ?? [];
    organizedChecklist.value = saved?.organizedChecklist ?? [];
    selectedItemIds.value = saved?.selectedItemIds ?? organizedChecklist.value.filter(item => item.selected).map(item => item.id);
    lastUpdatedAt.value = saved?.lastUpdatedAt ?? '';
    hydrated.value = true;
  }

  function appendMessage(role: CangjieConversationTurn['role'], content: string): CangjieChatMessage {
    const message: CangjieChatMessage = {
      id: createMessageId(role),
      role,
      content: content.trim(),
      createdAt: new Date().toISOString(),
    };
    if (message.content) {
      messages.value = [...messages.value, message];
    }
    return message;
  }

  function setChecklist(items: CangjieChecklistItem[]) {
    organizedChecklist.value = items
      .map(item => ({
        ...item,
        title: item.title.trim(),
        content: item.content.trim(),
        selected: item.selected !== false,
      }))
      .filter(item => Boolean(item.id && item.title && item.content));
    syncSelectedIds();
    saveSession();
  }

  function selectAllChecklist(selected = true) {
    organizedChecklist.value = organizedChecklist.value.map(item => ({ ...item, selected }));
    syncSelectedIds();
    saveSession();
  }

  function resetSession() {
    messages.value = [];
    organizedChecklist.value = [];
    selectedItemIds.value = [];
    lastUpdatedAt.value = '';
    if (canUseStorage()) {
      window.localStorage.removeItem(CANGJIE_SESSION_STORAGE_KEY);
    }
  }

  hydrateSession();

  watch([messages, organizedChecklist], saveSession, { deep: true });

  const hasUserMessages = computed(() => messages.value.some(message => message.role === 'user'));
  const hasChecklist = computed(() => organizedChecklist.value.length > 0);
  const selectedChecklist = computed(() => organizedChecklist.value.filter(item => item.selected));
  const selectedCount = computed(() => selectedChecklist.value.length);

  return {
    messages,
    organizedChecklist,
    selectedItemIds,
    lastUpdatedAt,
    hydrated,
    hasUserMessages,
    hasChecklist,
    selectedChecklist,
    selectedCount,
    appendMessage,
    setChecklist,
    selectAllChecklist,
    resetSession,
  };
}
