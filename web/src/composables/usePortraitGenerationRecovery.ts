import { fetchCharacters } from '../api/characters';
import type { CharacterProfile } from '../types';
import { isRecoverableLongRunningRequestError } from '../utils/api-error';

type WaitForPortraitSyncOptions = {
  novelId: string;
  characterId: string;
  previousPortraitImagePath?: string;
  previousUpdatedAt?: string;
  timeoutMs?: number;
  intervalMs?: number;
};

type PortraitSyncResult = {
  synced: boolean;
  character?: CharacterProfile;
  characters?: CharacterProfile[];
};

const DEFAULT_SYNC_TIMEOUT_MS = 3 * 60_000;
const DEFAULT_SYNC_INTERVAL_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isFreshPortrait(
  character: CharacterProfile | undefined,
  previousPortraitImagePath?: string,
  previousUpdatedAt?: string,
): character is CharacterProfile {
  if (!character?.portraitImagePath) return false;
  if (!previousPortraitImagePath) return true;

  const currentUpdatedAt = Date.parse(character.updatedAt);
  const previousUpdatedAtMs = Date.parse(previousUpdatedAt || '');
  if (!Number.isFinite(currentUpdatedAt) || !Number.isFinite(previousUpdatedAtMs)) {
    return character.portraitImagePath !== previousPortraitImagePath;
  }

  return currentUpdatedAt > previousUpdatedAtMs;
}

export function isRecoverablePortraitGenerationError(error: unknown): boolean {
  return isRecoverableLongRunningRequestError(error);
}

export async function waitForPortraitGenerationSync(
  options: WaitForPortraitSyncOptions,
): Promise<PortraitSyncResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_SYNC_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? DEFAULT_SYNC_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;
  let lastCharacters: CharacterProfile[] | undefined;

  while (Date.now() <= deadline) {
    try {
      const nextCharacters = await fetchCharacters(options.novelId);
      lastCharacters = nextCharacters;
      const character = nextCharacters.find((item) => item.id === options.characterId);
      if (isFreshPortrait(character, options.previousPortraitImagePath, options.previousUpdatedAt)) {
        return {
          synced: true,
          character,
          characters: nextCharacters,
        };
      }
    } catch {
      // Keep polling; the original generation request may still complete.
    }

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    await sleep(Math.min(intervalMs, remainingMs));
  }

  return {
    synced: false,
    characters: lastCharacters,
  };
}
