import { Request, Response, NextFunction } from 'express';
import { getConfigManager } from '../utils';

function extractProvidedKey(req: Request): string | undefined {
    const headerVal = req.headers['x-api-key'];
    const queryVal = req.query['api_key'];

    const headerKey = Array.isArray(headerVal) ? headerVal[0] : headerVal;
    const queryKey = Array.isArray(queryVal) ? queryVal[0] : queryVal;

    if (typeof headerKey === 'string' && headerKey.trim()) return headerKey.trim();
    if (typeof queryKey === 'string' && queryKey.trim()) return queryKey.trim();
    return undefined;
}

export function createApiKeyMiddleware(apiKey?: string) {
    const normalizedKey = apiKey?.trim();

    return (req: Request, res: Response, next: NextFunction) => {
        // If no API key is configured, allow all traffic (backwards compatible).
        if (!normalizedKey) return next();

        const provided = extractProvidedKey(req);
        if (provided && provided === normalizedKey) {
            return next();
        }

        return res.status(401).json({ error: 'Unauthorized' });
    };
}

const configManager = getConfigManager();
const serverConfig = configManager.getServerConfig();

// Default middleware uses server-level API key if configured
export const apiKeyMiddleware = createApiKeyMiddleware(serverConfig.apiKey);
