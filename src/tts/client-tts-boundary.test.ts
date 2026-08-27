import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');

function read(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('client tts boundary', () => {
  it('keeps reader-facing pages on browser-side tts', () => {
    expect(read('web/src/composables/useMobileBookReader.ts')).toContain('useReaderTTS');
    expect(read('web/src/views/MobileBookReader.vue')).toContain('reader.readerTTS');
    expect(read('web/src/views/MobileNovelReader.vue')).toContain('useReaderTTS');
    expect(read('web/src/components/mobile-entry/MobileReaderTTSPlaybackControls.vue')).toContain('tts.togglePause');
  });

  it('keeps server-side tts calls inside the admin allowlist', () => {
    const patterns = [
      'streamTTSSynthesize(',
      'previewVoice(',
      'previewNovelNarratorVoice(',
      'previewDesignedVoice(',
      'clearTTSCache(',
    ];

    const allowlist = new Set([
      'web/src/api/tts.ts',
      'web/src/components/AudiobookPanel.vue',
      'web/src/components/AdminAudiobookPanel.vue',
      'web/src/components/TTSPlayer.vue',
      'web/src/components/mobile-entry/MobileReaderTTSPanel.vue',
      'web/src/components/mobile-entry/CharacterVoiceSettingSheet.vue',
      'web/src/composables/useEdgeOnlineTTS.ts',
      'web/src/composables/useNarratorVoice.ts',
      'web/src/composables/useReaderTTS.ts',
      'web/src/composables/useTTSManager.ts',
      'web/src/utils/tts-audio-cache.ts',
      'web/src/desktop/DesktopAudioDrama.vue',
      'web/src/desktop/views/DesktopBookReader.vue',
      'web/src/desktop/views/DesktopSettings.vue',
      'web/src/views/MobileAudioDrama.vue',
      'web/src/views/MobileBookReader.vue',
      'web/src/views/MobileMe.vue',
      'web/src/views/MobileNovelReader.vue',
      'web/src/views/MobileNovelShowcase.vue',
      'web/src/views/MobileSettingsPage.vue',
    ]);

    const sourceFiles = globSync('web/src/**/*.{ts,vue}', {
      cwd: repoRoot,
    });

    const violations: string[] = [];

    for (const rawRelativePath of sourceFiles) {
      const relativePath = rawRelativePath.replaceAll('\\', '/');
      const content = read(relativePath);
      if (patterns.some((pattern) => content.includes(pattern)) && !allowlist.has(relativePath)) {
        violations.push(relativePath);
      }
    }

    expect(violations).toEqual([]);
  });

  it('hides admin-only voice preview controls from non-admin users', () => {
    const voiceSheet = read('web/src/components/mobile-entry/CharacterVoiceSettingSheet.vue');
    expect(voiceSheet).toContain("if (!authStore.isAdmin) {");
    expect(voiceSheet).toContain("await clientTTS.speak(text, { voiceName: selectedVoice.value });");
    expect(voiceSheet.indexOf("await clientTTS.speak(text, { voiceName: selectedVoice.value });"))
      .toBeLessThan(voiceSheet.indexOf('const result = await previewVoice({ voice: selectedVoice.value, text });'));
  });
});
