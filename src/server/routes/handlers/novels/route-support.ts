import type { Request, Response } from 'express';
import type { NovelMetadata } from '../../../../novel/types.js';

export type LoadNovelRouteFn = (req: Request, res: Response) => Promise<NovelMetadata | null>;
