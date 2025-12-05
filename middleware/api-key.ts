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
    console.log('DEBUG: API Key middleware created with key:', normalizedKey ? '***SET***' : 'NOT SET');

    return (req: Request, res: Response, next: NextFunction) => {
        console.log('DEBUG: API Key middleware called for:', req.method, req.path);
        console.log('DEBUG: normalizedKey:', normalizedKey ? '***SET***' : 'NOT SET');
        
        // If no API key is configured, allow all traffic (backwards compatible).
        if (!normalizedKey) {
            console.log('DEBUG: No API key configured, allowing request');
            return next();
        }

        const provided = extractProvidedKey(req);
        console.log('DEBUG: Provided key:', provided ? '***PROVIDED***' : 'NOT PROVIDED');
        
        if (provided && provided === normalizedKey) {
            console.log('DEBUG: API key matches, allowing request');
            return next();
        }

        console.log('DEBUG: API key mismatch or not provided, rejecting');
        return res.status(401).json({ error: 'Unauthorized' });
    };
}

const configManager = getConfigManager();
const serverConfig = configManager.getServerConfig();

// Default middleware uses server-level API key if configured
export const apiKeyMiddleware = createApiKeyMiddleware(serverConfig.apiKey);
