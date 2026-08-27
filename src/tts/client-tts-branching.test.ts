import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');

function read(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8').replaceAll('\r\n', '\n');
}

describe('client tts branching', () => {
  it('routes non-admin workspace playback to client tts before any server synthesis', () => {
    const content = read('web/src/composables/useTTSManager.ts');
    const nonAdminGuard = "if (userRole.value !== 'admin') {\n      return handleClientTTS();\n    }";
    const serverSynthesis = 'ttsAbort = api.streamTTSSynthesize(';
    const clientPlayback = 'await clientTTS.speakQueue(';

    expect(content).toContain(nonAdminGuard);
    expect(content).toContain(clientPlayback);
    expect(content.indexOf(nonAdminGuard)).toBeLessThan(content.indexOf(serverSynthesis));
  });

  it('routes non-admin narrator preview to browser speech before server preview api', () => {
    const content = read('web/src/composables/useNarratorVoice.ts');
    const nonAdminGuard = "if (userRole.value !== 'admin') {";
    const clientPreview = 'await clientTTS.speak(previewText, {';
    const serverPreview = 'const result = await api.previewNovelNarratorVoice(novelId.value, {';

    expect(content).toContain(nonAdminGuard);
    expect(content).toContain(clientPreview);
    expect(content).toContain(serverPreview);
    expect(content.indexOf(clientPreview)).toBeLessThan(content.indexOf(serverPreview));
  });

  it('routes non-admin character voice preview to browser speech before server preview', () => {
    const content = read('web/src/components/mobile-entry/CharacterVoiceSettingSheet.vue');
    const clientPreview = "if (!authStore.isAdmin) {\n      if (!clientTTS.isSupported()) {";
    const clientSpeak = 'await clientTTS.speak(text, { voiceName: selectedVoice.value });';
    const sheetServerPreview = 'const result = await previewVoice({ voice: selectedVoice.value, text });';

    expect(content).toContain(clientPreview);
    expect(content).toContain(clientSpeak);
    expect(content).toContain(sheetServerPreview);
    expect(content.indexOf(clientSpeak)).toBeLessThan(content.indexOf(sheetServerPreview));
    expect(read('web/src/api/tts.ts')).toContain('export async function previewVoice(params: {');
  });

  it('keeps workspace command items aligned with client-side tts for non-admin users', () => {
    const content = read('web/src/composables/useWorkspaceCommandItems.ts');

    expect(content).toContain("subtitle: isAdmin ? '优先播放已合成缓存（否则合成）' : '使用当前浏览器本机语音朗读'");
    expect(content).toContain("title: isAdmin ? 'TTS 重新合成' : 'TTS 重新合成（仅管理员）'");
    expect(content).toContain("subtitle: isAdmin ? '清理缓存后重播' : '普通用户走浏览器本机朗读，不提供服务端重合成'");
    expect(content).toContain("title: isAdmin ? 'TTS 批量排队' : 'TTS 批量排队（仅管理员）'");
    expect(content).toContain("subtitle: isAdmin ? '选择章节批量合成播报' : '普通用户不提供服务端批量合成队列'");
    expect(content).toContain("disabled: !hasChapter || !isAdmin");
    expect(content).toContain("disabled: !hasChapter || generating || !isAdmin");
  });
});
