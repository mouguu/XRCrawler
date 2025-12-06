/**
 * API Key Middleware for Hono
 */

import { createMiddleware } from 'hono/factory';
import { getConfigManager } from '../../utils';

const configManager = getConfigManager();
const serverConfig = configManager.getServerConfig();
const normalizedKey = serverConfig.apiKey?.trim();

// Log initialization only once when module loads (remove to avoid repeated logs on HMR/reload)
// If API key is not set, middleware will allow all traffic (backwards compatible)

export const apiKeyMiddleware = createMiddleware(async (c, next) => {
  // If no API key is configured, allow all traffic (backwards compatible)
  if (!normalizedKey) {
    return next();
  }

  // Extract key from header or query param
  const headerKey = c.req.header('x-api-key');
  const queryKey = c.req.query('api_key');
  const provided = headerKey?.trim() || queryKey?.trim();

  if (provided && provided === normalizedKey) {
    return next();
  }

  return c.json({ error: 'Unauthorized' }, 401);
});
