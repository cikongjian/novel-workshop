import fs from 'node:fs/promises';
import path from 'node:path';
import { getNovelsDir, readSettings } from '../../../../config/index.js';
import type { BookStoreManager } from '../../../../bookstore/bookstore-manager.js';
import type { ComicManifest, ComicPanelResult } from '../../../../comic/comic-image-service.js';

const PANEL_FILE_PATTERN = /^panel-\d+-[a-f0-9]{8}\.(png|jpg|jpeg|webp)$/;

export type PublicComicPanel = Pick<
  ComicPanelResult,
  | 'panelIndex'
  | 'imagePath'
  | 'narration'
  | 'dialogue'
  | 'textRenderMode'
  | 'pageIndex'
  | 'panelIndexInPage'
  | 'panelRole'
  | 'layoutTemplate'
  | 'bubblePlacement'
  | 'sfx'
  | 'emotion'
>;

export type PublicComicManifest = {
  chapterNumber: number;
  generatedAt: string;
  size: string;
  status: 'published';
  panels: PublicComicPanel[];
};

export type PublicComicPanelFile = {
  filePath: string;
  mime: string;
};

type PublicComicDeps = {
  bookId: string;
  novelId: string;
  chapterNumber: number;
  bookStoreManager: BookStoreManager;
};

export async function readPublishedComicManifest(deps: PublicComicDeps): Promise<PublicComicManifest | null> {
  if (!readSettings().comicChapterEnabled) return null;

  const chapterIsPublished = await isBookChapterPublished(deps.bookId, deps.chapterNumber, deps.bookStoreManager);
  if (!chapterIsPublished) return null;

  const manifest = await readComicManifest(deps.novelId, deps.chapterNumber);
  if (!manifest || manifest.status !== 'published') return null;

  const panels: PublicComicPanel[] = [];
  for (const panel of manifest.panels) {
    if (!panel.imagePath) continue;
    const imagePath = resolvePanelImagePath(deps.novelId, deps.chapterNumber, panel.imagePath);
    if (!imagePath) continue;
    try {
      await fs.access(imagePath);
    } catch {
      continue;
    }
    panels.push(toPublicPanel(panel));
  }

  if (panels.length === 0) return null;
  return {
    chapterNumber: deps.chapterNumber,
    generatedAt: manifest.generatedAt,
    size: manifest.size,
    status: 'published',
    panels,
  };
}

export async function resolvePublishedComicPanelFile(
  deps: PublicComicDeps & { file: string },
): Promise<PublicComicPanelFile | null> {
  if (!PANEL_FILE_PATTERN.test(deps.file)) return null;

  const manifest = await readPublishedComicManifest(deps);
  if (!manifest) return null;

  const matched = manifest.panels.some((panel) => path.basename(panel.imagePath) === deps.file);
  if (!matched) return null;

  const filePath = path.join(getNovelsDir(), deps.novelId, `comics/chapter-${deps.chapterNumber}`, deps.file);
  try {
    await fs.access(filePath);
  } catch {
    return null;
  }

  return {
    filePath,
    mime: resolveImageMime(deps.file),
  };
}

async function isBookChapterPublished(
  bookId: string,
  chapterNumber: number,
  bookStoreManager: BookStoreManager,
): Promise<boolean> {
  const publishedEntries = await bookStoreManager.getPublishedChapters(bookId);
  return publishedEntries.some((entry) => (
    entry.chapterNumber === chapterNumber &&
    entry.status === 'published'
  ));
}

async function readComicManifest(novelId: string, chapterNumber: number): Promise<ComicManifest | null> {
  const manifestPath = path.join(getNovelsDir(), novelId, `comics/chapter-${chapterNumber}`, 'manifest.json');
  try {
    return JSON.parse(await fs.readFile(manifestPath, 'utf-8')) as ComicManifest;
  } catch {
    return null;
  }
}

function resolvePanelImagePath(novelId: string, chapterNumber: number, imagePath: string): string | null {
  const expectedPrefix = `comics/chapter-${chapterNumber}/`;
  if (!imagePath.startsWith(expectedPrefix)) return null;

  const file = path.basename(imagePath);
  if (!PANEL_FILE_PATTERN.test(file)) return null;

  return path.join(getNovelsDir(), novelId, expectedPrefix, file);
}

function toPublicPanel(panel: ComicPanelResult): PublicComicPanel {
  return {
    panelIndex: panel.panelIndex,
    imagePath: panel.imagePath,
    narration: panel.narration,
    dialogue: panel.dialogue,
    textRenderMode: panel.textRenderMode,
    pageIndex: panel.pageIndex,
    panelIndexInPage: panel.panelIndexInPage,
    panelRole: panel.panelRole,
    layoutTemplate: panel.layoutTemplate,
    bubblePlacement: panel.bubblePlacement,
    sfx: panel.sfx,
    emotion: panel.emotion,
  };
}

function resolveImageMime(file: string): string {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.webp') return 'image/webp';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'image/png';
}
