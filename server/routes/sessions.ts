/**
 * Session Management Routes
 * Handles CRUD operations for sessions and cookies
 */
import { Hono } from 'hono';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CookieManager, createCookieManager } from '../../core';
import { createEnhancedLogger, safeJsonParse } from '../../utils';

const logger = createEnhancedLogger('SessionRoutes');
const sessionRoutes = new Hono();

// GET /api/sessions
sessionRoutes.get('/sessions', async (c) => {
  try {
    // Try multiple possible cookie directory locations
    // Priority: data/cookies (Docker) > cookies (local) > cookies-local (Docker fallback)
    const possibleDirs = [
      path.join(process.cwd(), 'data', 'cookies'),  // Docker primary location
      path.join(process.cwd(), 'cookies'),          // Local development
      '/app/cookies',                                // Docker absolute path
      '/app/cookies-local',                          // Docker fallback
      './cookies',
      './data/cookies',
    ];

    // Find the first existing directory
    let cookiesDir: string | null = null;
    for (const dir of possibleDirs) {
      const resolved = path.resolve(dir);
      if (fs.existsSync(resolved)) {
        cookiesDir = resolved;
        logger.info(`Using cookies directory: ${cookiesDir}`);
        break;
      }
    }

    if (!cookiesDir) {
      logger.warn(`No cookies directory found. Tried: ${possibleDirs.join(', ')}`);
      logger.info(`process.cwd(): ${process.cwd()}`);
      return c.json({ success: true, sessions: [] });
    }

    // Create CookieManager with explicit directory
    const cookieManager = new CookieManager({ cookiesDir });

    logger.info(`Scanning cookies directory: ${cookiesDir}`);

    const sessions = await cookieManager.listSessions();

    // Enrich with database labels (custom display names)
    // Also auto-import sessions to database if they don't exist
    const { prisma } = await import('../../core/db/prisma');
    const enrichedSessions = await Promise.all(
      sessions.map(async (session) => {
        try {
          const baseName = path.basename(session.filename, '.json');

          // Try to find in database by username (which is usually the filename)
          let dbSession = await prisma.cookieSession.findFirst({
            where: {
              platform: 'twitter',
              username: baseName,
            },
          });

          // If not found, try to find by label
          if (!dbSession) {
            dbSession = await prisma.cookieSession.findFirst({
              where: {
                platform: 'twitter',
                label: baseName,
              },
            });
          }

          // If still not found and session is valid, auto-import it
          if (!dbSession && session.isValid && session.cookieCount > 0) {
            try {
              // Read cookie file to import
              const cookieFile = path.join(cookiesDir!, session.filename);
              if (fs.existsSync(cookieFile)) {
                const cookieContent = fs.readFileSync(cookieFile, 'utf-8');
                const cookieData = safeJsonParse(cookieContent) as any;
                const cookies = Array.isArray(cookieData) ? cookieData : (cookieData?.cookies || []);

                if (Array.isArray(cookies) && cookies.length > 0) {
                  dbSession = await prisma.cookieSession.upsert({
                    where: {
                      platform_username: {
                        platform: 'twitter',
                        username: baseName,
                      },
                    },
                    update: {
                      cookies: cookies as any,
                      isValid: true,
                      label: baseName, // Default label is the filename
                    },
                    create: {
                      platform: 'twitter',
                      username: baseName,
                      label: baseName, // Default label is the filename
                      cookies: cookies as any,
                      isValid: true,
                    },
                  });
                  logger.info(`Auto-imported session ${session.filename} to database`);
                }
              }
            } catch (importError) {
              const err = importError as Error;
              logger.warn(`Failed to auto-import ${session.filename}: ${err.message}`);
            }
          }

          if (dbSession) {
            return {
              ...session,
              displayName: dbSession.label !== baseName ? dbSession.label : undefined,
              dbId: dbSession.id,
            };
          }
        } catch (error) {
          // If DB query fails, just return session without enrichment
          const err = error as Error;
          logger.warn(`Failed to query DB for session ${session.filename}: ${err.message}`);
        }
        return session;
      }),
    );

    // Sort sessions by filename number in descending order (account4, account3, account2, account1)
    enrichedSessions.sort((a, b) => {
      // Extract number from filename (e.g., "account1.json" -> 1, "account2.json" -> 2)
      const extractNumber = (filename: string): number => {
        const match = filename.match(/(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      };
      const numA = extractNumber(a.filename);
      const numB = extractNumber(b.filename);
      // Descending order: higher numbers first
      return numB - numA;
    });

    logger.info(`Found ${enrichedSessions.length} sessions`);
    return c.json({ success: true, sessions: enrichedSessions });
  } catch (err) {
    const error = err as Error & { code?: string };
    logger.error('Failed to list sessions', error);
    if (error.stack) {
      logger.error(`Error stack: ${error.stack}`);
    }
    // Even on error, return empty array instead of failing
    // This ensures the UI can still render even if there's a listing issue
      return c.json({ success: true, sessions: [] });
  }
});

// PATCH /api/sessions/:filename/rename
sessionRoutes.patch('/sessions/:filename/rename', async (c) => {
  try {
    const filename = c.req.param('filename');
    const body = await c.req.json();
    const { displayName } = body;

    if (!displayName || typeof displayName !== 'string' || displayName.trim().length === 0) {
      return c.json({ success: false, error: 'Display name is required' }, 400);
    }

    const baseName = path.basename(filename, '.json');
    const sanitizedName = displayName.trim().replace(/[^a-zA-Z0-9_-]/g, '_');

    const { prisma } = await import('../../core/db/prisma');

    // Find or create session in database
    const dbSession = await prisma.cookieSession.upsert({
      where: {
        platform_username: {
          platform: 'twitter',
          username: baseName,
        },
      },
      update: {
        label: sanitizedName,
      },
      create: {
        platform: 'twitter',
        username: baseName,
        label: sanitizedName,
        isValid: true,
      },
    });

    logger.info(`Renamed session ${filename} to "${sanitizedName}"`);

    return c.json({
      success: true,
      session: {
        filename,
        displayName: sanitizedName,
        dbId: dbSession.id,
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

    // Save file
    const filename = file.name.endsWith('.json') ? file.name : `${file.name}.json`;
    const filePath = path.join(cookiesDir, filename);
    const fileBuffer = await file.arrayBuffer();
    fs.writeFileSync(filePath, Buffer.from(fileBuffer));

    // Validate the uploaded file
    const cookieManager = await createCookieManager();
    try {
      await cookieManager.loadFromFile(filePath);
      return c.json({
        success: true,
        message: 'Cookies uploaded and validated successfully',
        filename,
      });
    } catch (err) {
      const validationError = err as Error;
      // If invalid, delete the file
      fs.unlinkSync(filePath);
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
