import type { CoverCandidate } from '../components/dashboard/ai-cover-candidate-types';

const COVER_HISTORY_DB = 'novel-workshop-cover-history';
const COVER_HISTORY_STORE = 'novel-cover-candidate-state';

export type PersistedCoverCandidate = Omit<CoverCandidate, 'previewUrl'>;

type PersistedCoverCandidateState = {
  novelId: string;
  currentCandidates: PersistedCoverCandidate[];
  historyCandidates: PersistedCoverCandidate[];
  updatedAt: number;
};

function openCoverHistoryDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('当前环境不支持 IndexedDB'));
      return;
    }

    const request = indexedDB.open(COVER_HISTORY_DB, 1);
    request.onerror = () => reject(request.error ?? new Error('封面候选历史数据库打开失败'));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(COVER_HISTORY_STORE)) {
        database.createObjectStore(COVER_HISTORY_STORE, { keyPath: 'novelId' });
      }
    };
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openCoverHistoryDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(COVER_HISTORY_STORE, mode);
    const store = transaction.objectStore(COVER_HISTORY_STORE);
    const request = handler(store);

    request.onerror = () => reject(request.error ?? new Error('封面候选历史读写失败'));
    request.onsuccess = () => resolve(request.result);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error ?? new Error('封面候选历史事务失败'));
    transaction.onabort = () => reject(transaction.error ?? new Error('封面候选历史事务已终止'));
  });
}

export async function loadPersistedCoverCandidateState(novelId: string): Promise<PersistedCoverCandidateState | null> {
  try {
    const result = await withStore<PersistedCoverCandidateState | undefined>('readonly', store => store.get(novelId));
    return result ?? null;
  } catch {
    return null;
  }
}

export async function savePersistedCoverCandidateState(
  novelId: string,
  currentCandidates: PersistedCoverCandidate[],
  historyCandidates: PersistedCoverCandidate[],
): Promise<void> {
  const payload: PersistedCoverCandidateState = {
    novelId,
    currentCandidates,
    historyCandidates,
    updatedAt: Date.now(),
  };

  try {
    await withStore<IDBValidKey>('readwrite', store => store.put(payload));
  } catch {
    // Ignore persistence failures and keep the in-memory experience working.
  }
}

export async function clearPersistedCoverCandidateState(novelId: string): Promise<void> {
  try {
    await withStore<undefined>('readwrite', store => store.delete(novelId));
  } catch {
    // Ignore persistence failures and keep the in-memory experience working.
  }
}
