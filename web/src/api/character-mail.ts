/**
 * 角色信箱 API
 */
import { http } from './http';

/** 可写信的角色信息 */
export interface WritableCharacter {
  id: string;
  name: string;
  role: string;
  roleLabel: string;
  personality: string;
  personalityTraits: string[];
  portraitImagePath: string;
}

/** 信件记录 */
export interface LetterRecord {
  id: string;
  novelId: string;
  novelTitle: string;
  characterId: string;
  characterName: string;
  characterRole: string;
  readerId: string;
  readerName: string;
  readerMessage: string;
  replyContent: string;
  createdAt: number;
}

/** 角色信件统计 */
export interface CharacterLetterStat {
  characterId: string;
  characterName: string;
  characterRole: string;
  count: number;
}

/** 获取可写信的角色列表 */
export async function fetchWritableCharacters(novelId: string): Promise<WritableCharacter[]> {
  const res = await http.get('/letters/characters', { params: { novelId } });
  return res.data.characters ?? [];
}

/** 写信 + AI 回信 */
export async function sendLetter(
  novelId: string,
  characterId: string,
  message: string,
): Promise<LetterRecord> {
  const res = await http.post('/letters/send', { novelId, characterId, message });
  return res.data.letter;
}

/** 我的信箱 */
export async function fetchMyLetters(novelId?: string): Promise<LetterRecord[]> {
  const res = await http.get('/letters/history', { params: novelId ? { novelId } : {} });
  return res.data.letters ?? [];
}

/** 作者查看某小说的信件 */
export async function fetchNovelLetters(
  novelId: string,
): Promise<{ letters: LetterRecord[]; stats: CharacterLetterStat[]; total: number }> {
  const res = await http.get('/letters/by-novel', { params: { novelId } });
  return res.data;
}

/** 删除历史信件 */
export async function deleteLetter(id: string): Promise<void> {
  await http.delete(`/letters/${id}`);
}
