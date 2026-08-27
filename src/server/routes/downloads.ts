import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('downloads-route');

// ---------- 类型 ----------
interface DownloadItem {
  id: string;
  platform: string;
  name: string;
  version: string;
  description: string;
  fileSize: string;
  directUrl: string;
  baiduPanUrl: string;
  baiduPanCode: string;
  enabled: boolean;
  updatedAt: string;
}

interface DownloadConfig {
  items: DownloadItem[];
  notice: string;
}

const DEFAULT_CONFIG: DownloadConfig = { items: [], notice: '' };
const DOWNLOADS_DIR_NAME = 'downloads';
const CONFIG_FILENAME = 'download-config.json';
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

// ---------- 路由工厂 ----------
export function createDownloadsRouter(dataDir: string): Router {
  const router = Router();
  const configPath = path.join(dataDir, CONFIG_FILENAME);
  const filesDir = path.join(dataDir, DOWNLOADS_DIR_NAME);

  function sendDeprecated(res: import('express').Response, code: string) {
    const messageByCode: Record<string, string> = {
      DOWNLOAD_DELETE_FILE_DEPRECATED: '该下载文件删除接口已下线。',
    };
    return res.status(410).json({
      error: messageByCode[code] ?? '该下载管理接口已下线。',
      code,
    });
  }

  function ensureAdmin(req: import('express').Request, res: import('express').Response): boolean {
    if (req.auth?.role === 'admin') {
      return true;
    }
    res.status(403).json({ error: '需要管理员权限' });
    return false;
  }

  // multer 配置
  const storage = multer.diskStorage({
    destination: async (_req, _file, cb) => {
      await fs.mkdir(filesDir, { recursive: true });
      cb(null, filesDir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${randomUUID()}${ext}`);
    },
  });
  const ALLOWED_EXTENSIONS = new Set(['.exe', '.msi', '.dmg', '.deb', '.rpm', '.zip', '.tar', '.gz', '.7z', '.pkg', '.apk', '.iso', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx']);

  const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
        cb(new Error(`不支持的文件类型: ${ext}`));
        return;
      }
      cb(null, true);
    },
  });

  // 读写配置
  async function readConfig(): Promise<DownloadConfig> {
    try {
      const raw = await fs.readFile(configPath, 'utf-8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  async function writeConfig(config: DownloadConfig): Promise<void> {
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  async function isPublicFileEnabled(filename: string): Promise<boolean> {
    const config = await readConfig();
    return config.items.some((item) => {
      if (!item.enabled) return false;
      const url = String(item.directUrl ?? '').trim();
      if (!url) return false;
      return path.basename(url) === filename;
    });
  }

  // GET / — 公开，返回已启用的下载项
  router.get('/', async (_req, res) => {
    try {
      const config = await readConfig();
      res.json({
        items: config.items.filter((item) => item.enabled),
        notice: config.notice,
      });
    } catch (err) {
      res.status(500).json({ error: '获取下载列表失败' });
    }
  });

  // GET /config — admin，返回完整配置
  router.get('/config', (req, res, next) => {
    if (!ensureAdmin(req, res)) {
      logger.warn('GET /config denied — insufficient role');
      return;
    }
    logger.debug('GET /config — admin verified, reading config');
    readConfig().then((config) => res.json(config)).catch(next);
  });

  // PUT /config — admin，保存配置
  router.put('/config', async (req, res) => {
    if (!ensureAdmin(req, res)) {
      return;
    }
    try {
      const { items, notice } = req.body as DownloadConfig;
      if (!Array.isArray(items)) {
        res.status(400).json({ error: 'items 必须是数组' });
        return;
      }
      const config: DownloadConfig = { items, notice: notice || '' };
      await writeConfig(config);
      res.json(config);
    } catch (err) {
      res.status(500).json({ error: '保存配置失败' });
    }
  });

  // POST /upload — admin，上传安装包
  router.post('/upload', async (req, res, next) => {
    if (!ensureAdmin(req, res)) {
      return;
    }
    next();
  }, upload.single('file'), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: '请选择文件' });
      return;
    }
    const url = `/api/downloads/file/${req.file.filename}`;
    const sizeBytes = req.file.size;
    const sizeMB = `${(sizeBytes / (1024 * 1024)).toFixed(1)}MB`;
    res.json({ url, filename: req.file.filename, fileSize: sizeMB });
  });

  // GET /file/:filename — 公开，下载文件
  router.get('/file/:filename', async (req, res) => {
    try {
      const filename = path.basename(req.params.filename); // 防止路径遍历
      if (!(await isPublicFileEnabled(filename))) {
        res.status(404).json({ error: '文件不存在' });
        return;
      }
      const filePath = path.join(filesDir, filename);
      await fs.access(filePath);
      res.download(filePath);
    } catch {
      res.status(404).json({ error: '文件不存在' });
    }
  });

  // DELETE /file/:filename — admin，删除文件
  router.delete('/file/:filename', async (req, res) => {
    if (!ensureAdmin(req, res)) {
      return;
    }
    return sendDeprecated(res, 'DOWNLOAD_DELETE_FILE_DEPRECATED');
  });

  return router;
}
