import type { RequestHandler } from 'express';

const HEALTH_CHECK_PATH = '/api/health';

export function createHttpsRedirect(serverHost: string): RequestHandler {
  return (req, res, next) => {
    if (
      req.path === HEALTH_CHECK_PATH
      || req.secure
      || req.headers['x-forwarded-proto'] === 'https'
    ) {
      next();
      return;
    }

    res.redirect(301, `https://${serverHost}${req.url}`);
  };
}
