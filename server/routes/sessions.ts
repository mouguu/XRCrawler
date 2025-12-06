/**
 * Session Management Routes
 * Handles CRUD operations for sessions and cookies
 */
import { Hono } from 'hono';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createEnhancedLogger, safeJsonParse } from '../../utils';

const logger = createEnhancedLogger('SessionRoutes');
const sessionRoutes = new Hono();

// GET /api/sessions
sessionRoutes.get('/sessions', async (c) => {
  try {
    // console.log for visibility
    console.log(`[DEBUG] Fetching sessions from DB. URL starts with: ${process.env.DATABASE_URL?.substring(0, 15)}...`);

    const { prisma } = await import('../../core/db/repositories');

    // Debug: count before findMany
    const count = await prisma.cookieSession.count();
    console.log(`[DEBUG] Session count in DB: ${count}`);

    const dbSessions = await prisma.cookieSession.findMany({
      orderBy: { lastUsed: 'desc' }
    });
    console.log(`[DEBUG] Fetched ${dbSessions.length} sessions from DB`);

    // Map to frontend expected format
    const sessions = dbSessions.map(session => {
      // Calculate cookieCount from cookies JSON field
      let cookieCount = 0;
      if (session.cookies) {
        if (Array.isArray(session.cookies)) {
          cookieCount = session.cookies.length;
        } else if (typeof session.cookies === 'object' && session.cookies !== null) {
          // Handle { cookies: [...] } format
          const cookiesArray = (session.cookies as any).cookies;
          cookieCount = Array.isArray(cookiesArray) ? cookiesArray.length : 0;
        }
      }

      return {
        id: session.id,
        // CRITICAL FIX: Use username as fallback if label is null/undefined to prevent "null.json" filename
        filename: `${session.label || session.username || 'unknown'}.json`, // Legacy compatibility
        displayName: session.label || session.username, // Display name with fallback
        username: session.username,
        platform: session.platform,
        isValid: session.isValid,
        lastUsed: session.lastUsed,
        errorCount: session.errorCount,
        cookieCount, // Add cookieCount for frontend
        dbId: session.id
      };
    });

    return c.json({ success: true, sessions });
  } catch (err) {
    const error = err as Error;
    logger.error('Failed to list sessions', error);
    // Return empty list instead of 500 to avoid breaking UI
    return c.json({ success: false, error: error.message, sessions: [] });
  }
});

// DELETE /api/sessions/:id
// Supports both dbId (UUID) and filename (legacy) for backward compatibility
sessionRoutes.delete('/sessions/:id', async (c) => {
  try {
    const idOrFilename = c.req.param('id');
    const { prisma } = await import('../../core/db/repositories');

    let dbSession = null;

    // Try to find by ID first (UUID format)
    if (idOrFilename.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      dbSession = await prisma.cookieSession.findUnique({
        where: { id: idOrFilename },
      });
    }

    // Fallback: find by username (from filename) for backward compatibility
    if (!dbSession) {
      const baseName = path.basename(idOrFilename, '.json');
      dbSession = await prisma.cookieSession.findFirst({
        where: {
          platform: 'twitter',
          username: baseName,
        },
      });
    }

    if (!dbSession) {
      return c.json({ success: false, error: 'Session not found' }, 404);
    }

    // Delete from database
    await prisma.cookieSession.delete({
      where: { id: dbSession.id },
    });

    // Also try to delete the file if it exists (using label or username)
    const cookiesDir = path.join(process.cwd(), 'cookies');
    const filename = `${dbSession.label || dbSession.username}.json`;
    const filePath = path.join(cookiesDir, filename);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (fileErr) {
        // Log but don't fail if file deletion fails
        logger.warn(`Failed to delete file ${filePath}: ${fileErr}`);
      }
    }

    logger.info(`Deleted session ${dbSession.label || dbSession.username} (${dbSession.id})`);

    return c.json({
      success: true,
      message: `Session ${dbSession.label || dbSession.username} deleted successfully`,
    });
  } catch (err) {
    const error = err as Error;
    logger.error('Failed to delete session', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// PATCH /api/sessions/:id/rename
// Supports both dbId (UUID) and filename (legacy) for backward compatibility
sessionRoutes.patch('/sessions/:id/rename', async (c) => {
  try {
    const idOrFilename = c.req.param('id');
    const body = await c.req.json();
    const { displayName, dbId } = body; // Support dbId from body as well

    if (!displayName || typeof displayName !== 'string' || displayName.trim().length === 0) {
      return c.json({ success: false, error: 'Display name is required' }, 400);
    }

    const sanitizedName = displayName.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    const { prisma } = await import('../../core/db/repositories');

    let dbSession = null;

    // Priority 1: Use dbId from body if provided
    if (dbId && dbId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      dbSession = await prisma.cookieSession.findUnique({
        where: { id: dbId },
      });
    }

    // Priority 2: Try to find by ID from URL (UUID format)
    if (!dbSession && idOrFilename.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      dbSession = await prisma.cookieSession.findUnique({
        where: { id: idOrFilename },
      });
    }

    // Priority 3: Fallback to username (from filename) for backward compatibility
    if (!dbSession) {
      const baseName = path.basename(idOrFilename, '.json');
      dbSession = await prisma.cookieSession.findFirst({
        where: {
          platform: 'twitter',
          username: baseName,
        },
      });
    }

    if (!dbSession) {
      return c.json({ success: false, error: 'Session not found' }, 404);
    }

    // Update only the label, NOT the username (username is part of unique constraint)
    const updatedSession = await prisma.cookieSession.update({
      where: { id: dbSession.id },
      data: {
        label: sanitizedName,
      },
    });

    logger.info(`Renamed session ${dbSession.username} (${dbSession.id}) label to "${sanitizedName}"`);

    return c.json({
      success: true,
      session: {
        id: updatedSession.id,
        filename: `${updatedSession.label || updatedSession.username}.json`,
        displayName: sanitizedName,
        username: updatedSession.username,
        dbId: updatedSession.id,
      },
    });
  } catch (err) {
    const error = err as Error;
    logger.error('Failed to rename session', error);
      return c.json({ success: false, error: error.message }, 500);
  }
});

// POST /api/cookies
sessionRoutes.post('/cookies', async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return c.json({ success: false, error: 'No file uploaded' }, 400);
    }

    // Ensure cookies directory exists
    const cookiesDir = path.join(process.cwd(), 'cookies');
    if (!fs.existsSync(cookiesDir)) {
      fs.mkdirSync(cookiesDir, { recursive: true });
    }

    // Save file locally for backup/legacy
    const filename = file.name.endsWith('.json') ? file.name : `${file.name}.json`;
    const filePath = path.join(cookiesDir, filename);
    const fileBuffer = await file.arrayBuffer();
    const content = Buffer.from(fileBuffer).toString('utf-8');
    fs.writeFileSync(filePath, content);

    // Validate and Import to DB
    try {
      const cookieData = safeJsonParse(content) as any;
      let cookies = [];
      let username = 'unknown';

      if (Array.isArray(cookieData)) {
        cookies = cookieData;
      } else if (cookieData?.cookies) {
        cookies = cookieData.cookies;
        username = cookieData.username || 'unknown';
      }

      if (!Array.isArray(cookies) || cookies.length === 0) {
        throw new Error('No cookies found in file');
      }

      // Try to extract username from cookies if unknown
      if (username === 'unknown') {
        const authCookie = cookies.find((c: any) => c.name === 'auth_token' || c.name === 'ct0');
        // This is a weak guess, better to check 'twid' or specific fields if possible,
        // but for now we rely on filename or explicit field.
        // If filename is like "username.json", use that
        const baseName = path.basename(filename, '.json');
        if (baseName && baseName !== 'cookies') username = baseName;
      }

      const { prisma } = await import('../../core/db/repositories');

      await prisma.cookieSession.upsert({
        where: {
          platform_username: {
            platform: 'twitter',
            username: username,
          }
        },
        update: {
          cookies: cookies as any,
          isValid: true,
          label: username
        },
        create: {
          platform: 'twitter',
          username: username,
          label: username,
          isValid: true,
          cookies: cookies as any
        }
      });

      return c.json({
        success: true,
        message: 'Cookies uploaded and imported successfully',
        filename,
      });

    } catch (err) {
      const validationError = err as Error;
      // If invalid, delete the file
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

      return c.json(
        {
          success: false,
          error: `Invalid cookie file: ${validationError.message}`,
        },
        400,
      );
    }
  } catch (err) {
    const error = err as Error;
    logger.error('Failed to upload cookies', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default sessionRoutes;
