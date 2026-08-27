export type AiUsageOperationDefinition = {
  scope: 'http' | 'system' | 'script';
  key: string;
  label: string;
  method?: string;
  pathPattern?: string;
};

type CompiledHttpOperation = AiUsageOperationDefinition & {
  scope: 'http';
  method: string;
  pathPattern: string;
  matcher: RegExp;
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizePath(path: string): string {
  const trimmed = (path || '/').split('?')[0].trim() || '/';
  const normalized = trimmed.replace(/\/{2,}/g, '/');
  if (normalized.length > 1 && normalized.endsWith('/')) {
    return normalized.slice(0, -1);
  }
  return normalized;
}

function compilePathPattern(pathPattern: string): RegExp {
  const normalized = normalizePath(pathPattern);
  const matcher = normalized
    .split('/')
    .map((segment) => {
      if (!segment) return '';
      if (segment.startsWith(':')) return '[^/]+';
      return escapeRegex(segment);
    })
    .join('/');
  return new RegExp(`^${matcher}$`);
}

function http(
  method: string,
  pathPattern: string,
  key: string,
  label: string,
): CompiledHttpOperation {
  return {
    scope: 'http',
    method: method.toUpperCase(),
    pathPattern: normalizePath(pathPattern),
    key,
    label,
    matcher: compilePathPattern(pathPattern),
  };
}

const HTTP_OPERATIONS: CompiledHttpOperation[] = [
  http('POST', '/api/generate/chapter', 'generate.chapter', 'Generate chapter'),
  http('POST', '/api/generate/revise', 'generate.revise', 'Revise chapter'),
  http('POST', '/api/generate/resize-chapter', 'generate.resize', 'Resize chapter'),
  http('POST', '/api/generate/chat', 'generate.chat', 'Creative chat'),
  http('POST', '/api/generate/expand-idea', 'generate.expand-idea', 'Expand idea'),
  http('POST', '/api/generate/inline', 'generate.inline', 'Inline assist'),
  http('POST', '/api/generate/backfill-speakers', 'generate.backfill-speakers', 'Backfill speakers'),
  http('POST', '/api/generate/explore-plot', 'generate.explore-plot', 'Explore plot'),
  http('POST', '/api/generate/character-chat', 'generate.character-chat', 'Character chat'),
  http('POST', '/api/generate/polish-dialogue', 'generate.polish-dialogue', 'Polish dialogue'),
  http('POST', '/api/generate/marketing-copy', 'generate.marketing-copy', 'Marketing copy'),
  http('POST', '/api/generate/recommend-book-title', 'generate.title-recommend', 'Recommend title'),
  http('POST', '/api/generate/synopsis', 'generate.synopsis', 'Generate synopsis'),
  http('POST', '/api/generate/author-note', 'generate.author-note', 'Author note'),
  http('POST', '/api/generate/batch-author-notes/start', 'generate.author-note-batch', 'Batch author notes'),
  http('POST', '/api/generate/batch-digest', 'generate.digest', 'Batch digest'),
  http('POST', '/api/generate/rebirth', 'generate.rebirth', 'Rebirth'),
  http('POST', '/api/generate/rewrite-chapter-preview', 'generate.rewrite-preview', 'Rewrite preview'),
  http('POST', '/api/generate/rewrite-chapter', 'generate.rewrite', 'Rewrite chapter'),
  http('POST', '/api/generate/rewrite-batch', 'generate.rewrite-batch', 'Batch rewrite'),
  http('POST', '/api/generate/batch', 'generate.batch', 'Batch generate'),
  http('POST', '/api/generate/batch-revise', 'generate.batch-revise', 'Batch revise'),
  http('POST', '/api/generate/curate-foreshadowing', 'generate.curate-foreshadowing', 'Curate foreshadowing'),
  http('POST', '/api/generate/curate-culture-world', 'generate.curate-culture-world', 'Curate culture world'),
  http('POST', '/api/generate/curate-history-world', 'generate.curate-history-world', 'Curate history world'),
  http('POST', '/api/generate/curate-power-world', 'generate.curate-power-world', 'Curate power world'),
  http('POST', '/api/generate/curate-faction-world', 'generate.curate-faction-world', 'Curate faction world'),

  http('POST', '/api/admin/zhihu-assistant/chat', 'admin.zhihu-assistant.chat', 'Admin Zhihu assistant chat'),

  http('POST', '/api/agent-skills/generate', 'agent-skills.generate', 'Generate agent skill'),
  http('POST', '/api/agent-skills/ab-test', 'agent-skills.ab-test', 'Agent skill AB test'),

  http('POST', '/api/auth/user-api/test-draft', 'auth.user-api.test-draft', 'Test user API draft'),
  http('POST', '/api/auth/user-api/profiles/:profileId/test', 'auth.user-api.test', 'Test user API profile'),

  http('POST', '/api/settings/test-model', 'settings.test-model', 'Test model'),
  http('POST', '/api/settings/test-embedding', 'settings.test-embedding', 'Test embedding'),
  http('POST', '/api/settings/test-image', 'settings.test-image', 'Test image'),
  http('POST', '/api/settings/reindex-memory', 'settings.memory-reindex', 'Settings memory reindex'),

  http('POST', '/api/trends/refresh', 'trends.refresh', 'Refresh trends'),

  http('POST', '/api/short-story/generate-chapter', 'short-story.generate-chapter', 'Generate short story chapter'),
  http('POST', '/api/short-story/batch-generate', 'short-story.batch-generate', 'Batch generate short story'),

  http('POST', '/api/shuangwen/preview', 'shuangwen.preview', 'Shuangwen preview'),
  http('POST', '/api/shuangwen/apply', 'shuangwen.apply', 'Shuangwen apply'),
  http('POST', '/api/shuangwen/create-async', 'shuangwen.create-async', 'Shuangwen create async'),
  http('POST', '/api/shuangwen/generate-chapter', 'shuangwen.generate-chapter', 'Shuangwen generate chapter'),

  http('POST', '/api/fun/dna/fate-profile', 'fun.dna.fate-profile', 'Generate DNA fate profile'),
  http('POST', '/api/fun/dna/seed-idea', 'fun.dna.seed-idea', 'Generate DNA seed idea'),
  http('POST', '/api/fun/dna/create-novel', 'fun.dna.create-novel', 'Create DNA novel'),
  http('POST', '/api/fun/dna/illustration', 'fun.dna.illustration', 'Generate DNA illustration'),
  http('POST', '/api/fun/cangjie/chat', 'fun.cangjie.chat', 'Cangjie chat'),
  http('POST', '/api/fun/cangjie/organize', 'fun.cangjie.organize', 'Cangjie organize'),
  http('POST', '/api/fun/cangjie/seed-idea', 'fun.cangjie.seed-idea', 'Cangjie seed idea'),

  http('POST', '/api/admin/dna-illustrations/:questionId/generate-prompt', 'admin.dna-illustrations.prompt', 'Generate DNA illustration prompt'),
  http('POST', '/api/admin/dna-illustrations/:questionId/generate-image', 'admin.dna-illustrations.image', 'Generate DNA illustration image'),

  http('POST', '/api/tts/design-voice/:novelId/:characterId', 'tts.design-voice', 'Design voice'),
  http('POST', '/api/tts/design-voices/:novelId', 'tts.design-voices', 'Design voices'),
  http('POST', '/api/tts/preview-designed/:novelId/:characterId', 'tts.preview-designed', 'Preview designed voice'),
  http('POST', '/api/tts/narrator-voice/:novelId/preview', 'tts.narrator-preview', 'Narrator preview'),
  http('POST', '/api/tts/preview', 'tts.preview', 'TTS preview'),
  http('GET', '/api/tts/:novelId/:chapterNumber', 'tts.chapter-synthesize', 'Synthesize chapter'),

  http('POST', '/api/novels/:novelId/cover-ai/prompt', 'novel.cover.prompt', 'Generate cover prompt'),
  http('POST', '/api/novels/:novelId/cover-ai/generate', 'novel.cover.generate', 'Generate cover'),
  http('POST', '/api/novels/:novelId/characters/:charId/portrait-prompt', 'character.portrait-prompt', 'Generate portrait prompt'),
  http('POST', '/api/novels/:novelId/characters/:charId/portrait', 'character.portrait-generate', 'Generate portrait'),
  http('POST', '/api/novels/:novelId/characters/backfill-tts', 'character.backfill-tts', 'Backfill TTS'),
  http('POST', '/api/novels/:novelId/characters/backfill-position', 'character.backfill-position', 'Backfill positions'),
  http('POST', '/api/novels/:novelId/characters/detect-duplicates', 'character.detect-duplicates', 'Detect duplicate characters'),
  http('POST', '/api/novels/:novelId/cast-session/propose', 'cast-session.propose', 'Cast session propose'),

  http('POST', '/api/novels/:novelId/chapters/finalize/:num', 'chapter.finalize', 'Finalize chapter'),
  http('POST', '/api/novels/:novelId/chapters/:num/generate-title', 'chapter.generate-title', 'Generate title'),
  http('POST', '/api/novels/:novelId/chapters/backfill-titles', 'chapter.backfill-titles', 'Backfill titles'),
  http('POST', '/api/novels/:novelId/chapters/clean-dialogue-bracket-preview', 'chapter.clean-dialogue-bracket-preview', 'Dialogue bracket preview'),
  http('POST', '/api/novels/:novelId/chapters/apply-clean-dialogue-bracket', 'chapter.clean-dialogue-bracket-apply', 'Dialogue bracket apply'),

  http('POST', '/api/novels/:novelId/outline/generate', 'outline.generate', 'Generate outline'),
  http('POST', '/api/novels/:novelId/outline/extend', 'outline.extend', 'Extend outline'),
  http('POST', '/api/novels/:novelId/outline/analyze', 'outline.analyze', 'Analyze outline'),

  http('POST', '/api/novels/:novelId/plot-branches/generate-preview', 'plot-branches.preview', 'Plot branch preview'),

  http('POST', '/api/novels/:novelId/adaptations/generate', 'adaptation.generate', 'Generate adaptation'),

  http('POST', '/api/novels/:novelId/memory/reindex', 'memory.reindex', 'Novel memory reindex'),
  http('POST', '/api/series/story-state/:novelId/backfill', 'series.story-state-backfill', 'Story state backfill'),
  http('POST', '/api/anchors/generate/:novelId', 'anchors.generate', 'Generate anchors'),

  http('POST', '/api/sync/import', 'sync.import', 'Sync import'),
  http('POST', '/api/sync/execute', 'sync.execute', 'Sync execute'),
];

const NON_HTTP_OPERATIONS: AiUsageOperationDefinition[] = [
  { scope: 'system', key: 'system.content-audit', label: 'Content audit' },
  { scope: 'system', key: 'system.trends.analyze', label: 'Trends analyze' },
  { scope: 'system', key: 'system.tob.generate', label: 'ToB generate' },
  { scope: 'system', key: 'system.tob.intervene', label: 'ToB intervene' },
  { scope: 'system', key: 'system.unscoped', label: 'Unscoped system AI call' },
  { scope: 'http', key: 'http.unregistered', label: 'Unregistered HTTP AI call' },
];

export const AI_USAGE_OPERATIONS: AiUsageOperationDefinition[] = [
  ...HTTP_OPERATIONS.map(({ matcher: _matcher, ...operation }) => operation),
  ...NON_HTTP_OPERATIONS,
];

const REGISTERED_OPERATION_KEYS = new Set(AI_USAGE_OPERATIONS.map((operation) => operation.key));

export function resolveHttpAiUsageOperation(
  method: string,
  requestPath: string,
): AiUsageOperationDefinition | undefined {
  const normalizedMethod = method.toUpperCase();
  const normalizedPath = normalizePath(requestPath);
  const matched = HTTP_OPERATIONS.find((operation) => (
    operation.method === normalizedMethod && operation.matcher.test(normalizedPath)
  ));
  if (!matched) return undefined;
  const { matcher: _matcher, ...operation } = matched;
  return operation;
}

export function isRegisteredAiUsageOperation(operationKey: string): boolean {
  return REGISTERED_OPERATION_KEYS.has(operationKey);
}
