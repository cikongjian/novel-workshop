/**
 * 角色信箱 composable — 管理写信/回信/历史信件状态
 */
import { ref, type Ref } from 'vue';
import {
  fetchWritableCharacters,
  sendLetter,
  fetchMyLetters,
  deleteLetter,
  type WritableCharacter,
  type LetterRecord,
} from '../api/character-mail';

export function useCharacterMailbox() {
  /** 角色列表 */
  const characters = ref<WritableCharacter[]>([]) as Ref<WritableCharacter[]>;
  /** 历史信件 */
  const letters = ref<LetterRecord[]>([]) as Ref<LetterRecord[]>;
  /** 加载状态 */
  const loadingCharacters = ref(false);
  const loadingLetters = ref(false);
  const sending = ref(false);
  /** 错误信息 */
  const error = ref('');

  /** 加载可写信的角色 */
  async function loadCharacters(novelId: string) {
    loadingCharacters.value = true;
    error.value = '';
    try {
      characters.value = await fetchWritableCharacters(novelId);
    } catch (err: any) {
      error.value = err?.response?.data?.error || '加载角色失败';
      characters.value = [];
    } finally {
      loadingCharacters.value = false;
    }
  }

  /** 写信 + 获取 AI 回信 */
  async function send(
    novelId: string,
    characterId: string,
    message: string,
  ): Promise<LetterRecord | null> {
    sending.value = true;
    error.value = '';
    try {
      const letter = await sendLetter(novelId, characterId, message);
      // 将新信件插入历史列表头部
      letters.value.unshift(letter);
      return letter;
    } catch (err: any) {
      error.value = err?.response?.data?.error || '寄信失败';
      return null;
    } finally {
      sending.value = false;
    }
  }

  /** 加载历史信件 */
  async function loadLetters(novelId?: string) {
    loadingLetters.value = true;
    error.value = '';
    try {
      letters.value = await fetchMyLetters(novelId);
    } catch (err: any) {
      error.value = err?.response?.data?.error || '加载信件失败';
      letters.value = [];
    } finally {
      loadingLetters.value = false;
    }
  }

  /** 删除信件 */
  async function remove(id: string): Promise<boolean> {
    error.value = '';
    try {
      await deleteLetter(id);
      letters.value = letters.value.filter((l) => l.id !== id);
      return true;
    } catch (err: any) {
      error.value = err?.response?.data?.error || '删除失败';
      return false;
    }
  }

  return {
    characters,
    letters,
    loadingCharacters,
    loadingLetters,
    sending,
    error,
    loadCharacters,
    send,
    loadLetters,
    remove,
  };
}
