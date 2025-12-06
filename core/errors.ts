/**
 * Error Handling Module (Consolidated)
 * Contains Error Codes, ScraperError, Classifier, Utils, and Snapshotter.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Page } from 'puppeteer';

// ==========================================
// Part 1: Error Codes & Types
// ==========================================

export enum ErrorCode {
  // Network Errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  CONNECTION_REFUSED = 'CONNECTION_REFUSED',
  TIMEOUT = 'TIMEOUT',
  DNS_ERROR = 'DNS_ERROR',
  // Authentication Errors
  AUTH_FAILED = 'AUTH_FAILED',
  LOGIN_REQUIRED = 'LOGIN_REQUIRED',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  ACCOUNT_SUSPENDED = 'ACCOUNT_SUSPENDED',
  // Rate Limiting
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  THROTTLED = 'THROTTLED',
  // API Errors
  API_ERROR = 'API_ERROR',
  INVALID_RESPONSE = 'INVALID_RESPONSE',
  BAD_REQUEST = 'BAD_REQUEST',
  NOT_FOUND = 'NOT_FOUND',
  SERVER_ERROR = 'SERVER_ERROR',
  // Browser/Puppeteer Errors
  BROWSER_CRASHED = 'BROWSER_CRASHED',
  BROWSER_ERROR = 'BROWSER_CRASHED',
  NAVIGATION_FAILED = 'NAVIGATION_FAILED',
  SELECTOR_TIMEOUT = 'SELECTOR_TIMEOUT',
  ELEMENT_NOT_FOUND = 'ELEMENT_NOT_FOUND',
  // Data Extraction Errors
  DATA_EXTRACTION_FAILED = 'DATA_EXTRACTION_FAILED',
  PARSING_ERROR = 'PARSING_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  // System Errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  CONFIG_ERROR = 'CONFIG_ERROR',
  FILE_SYSTEM_ERROR = 'FILE_SYSTEM_ERROR',
  // Aliases
  RATE_LIMIT = 'RATE_LIMIT_EXCEEDED',
  INVALID_CONFIG = 'CONFIG_ERROR',
}

export interface ErrorContext {
  url?: string;
  username?: string;
  tweetId?: string;
  operation?: string;
  statusCode?: number;
  retryCount?: number;
  [key: string]: any;
}

export enum ErrorType {
  NETWORK = 'network',
  RATE_LIMIT = 'rate_limit',
  AUTH = 'auth',
  TIMEOUT = 'timeout',
  NOT_FOUND = 'not_found',
  FORBIDDEN = 'forbidden',
  PROXY = 'proxy',
  UNKNOWN = 'unknown',
}

export interface ClassifiedError {
  type: ErrorType;
  message: string;
  retryable: boolean;
  retryAfter?: number;
  shouldSwitchProxy?: boolean;
}

// ==========================================
// Part 2: ScraperError Class
// ==========================================

export class ScraperError extends Error {
  public readonly code: ErrorCode;
  public readonly retryable: boolean;
  public readonly context: ErrorContext;
  public readonly timestamp: Date;
  public readonly originalError?: Error;
  public readonly statusCode?: number;

  constructor(
    code: ErrorCode,
    message: string,
    options: {
      retryable?: boolean;
      context?: ErrorContext;
      originalError?: Error;
      statusCode?: number;
    } = {},
  ) {
    super(message);
    this.name = 'ScraperError';
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.context = options.context || {};
    this.timestamp = new Date();
    this.originalError = options.originalError;
    this.statusCode = options.statusCode;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ScraperError);
    }
  }

  public isRecoverable(): boolean {
    return this.retryable;
  }

  public getUserMessage(): string {
    switch (this.code) {
      case ErrorCode.RATE_LIMIT_EXCEEDED:
      case ErrorCode.RATE_LIMIT:
        return '速率限制触发，稍后重试 (Rate limit exceeded).';
      case ErrorCode.AUTH_FAILED:
        return '认证失败，请检查账号或 Cookie (Authentication failed).';
      case ErrorCode.NETWORK_ERROR:
        return '网络连接失败，请检查网络 (Network error).';
      case ErrorCode.TIMEOUT:
        return 'Operation timed out.';
      case ErrorCode.NOT_FOUND:
        return 'Resource not found.';
      default:
        return this.message;
    }
  }

  public toJSON(): Record<string, any> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack,
      originalError: this.originalError
        ? {
            name: this.originalError.name,
            message: this.originalError.message,
            stack: this.originalError.stack,
          }
        : undefined,
    };
  }

  static fromHttpResponse(
    response: { status: number; statusText?: string },
    context?: ErrorContext,
  ): ScraperError {
    const statusCode = response.status;
    const statusText = response.statusText || String(statusCode);
    const ctx: ErrorContext = { ...(context || {}), statusCode };

    if (statusCode === 429) {
      return new ScraperError(ErrorCode.RATE_LIMIT, `Rate limit exceeded: ${statusText}`, {
        retryable: true,
        statusCode,
        context: ctx,
      });
    }
    if (statusCode === 401 || statusCode === 403) {
      return new ScraperError(ErrorCode.AUTH_FAILED, `Authentication failed: ${statusText}`, {
        retryable: false,
        statusCode,
        context: ctx,
      });
    }
    if (statusCode >= 500) {
      return new ScraperError(ErrorCode.API_ERROR, `Server error: ${statusText}`, {
        retryable: true,
        statusCode,
        context: ctx,
      });
    }
    return new ScraperError(ErrorCode.API_ERROR, `HTTP ${statusCode}: ${statusText}`, {
      retryable: false,
      statusCode,
      context: ctx,
    });
  }

  static fromError(
    error: Error,
    code: ErrorCode = ErrorCode.UNKNOWN_ERROR,
    retryable: boolean = false,
    context?: ErrorContext,
  ): ScraperError {
    return new ScraperError(code, error.message, {
      retryable,
      originalError: error,
      context,
    });
  }

  static isRateLimitError(error: unknown): boolean {
    if (error instanceof ScraperError) return error.code === ErrorCode.RATE_LIMIT_EXCEEDED;
    if (error instanceof Error) return ErrorClassifier.isRateLimit(error);
    return false;
  }

  static isAuthError(error: unknown): boolean {
    if (error instanceof ScraperError) {
      return (
        error.code === ErrorCode.AUTH_FAILED ||
        error.code === ErrorCode.LOGIN_REQUIRED ||
        error.code === ErrorCode.SESSION_EXPIRED ||
        error.code === ErrorCode.ACCOUNT_LOCKED ||
        error.code === ErrorCode.ACCOUNT_SUSPENDED
      );
    }
    if (error instanceof Error) {
      const lower = error.message.toLowerCase();
      return (
        lower.includes('auth') ||
        lower.includes('login') ||
        lower.includes('unauthorized') ||
        lower.includes('401') ||
        lower.includes('403')
      );
    }
    return false;
  }

  static isNetworkError(error: unknown): boolean {
    if (error instanceof ScraperError) {
      return (
        error.code === ErrorCode.NETWORK_ERROR ||
        error.code === ErrorCode.CONNECTION_REFUSED ||
        error.code === ErrorCode.TIMEOUT ||
        error.code === ErrorCode.DNS_ERROR
      );
    }
    if (error instanceof Error) return ErrorClassifier.isNetworkError(error);
    return false;
  }
}

// ==========================================
// Part 3: Error Classifier
// ==========================================

export class ErrorClassifier {
  static classify(error: unknown, context?: ErrorContext): ScraperError {
    if (error instanceof ScraperError) {
      if (context) Object.assign(error.context, context);
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    const originalError = error instanceof Error ? error : undefined;
    const lowerMessage = message.toLowerCase();

    // Rate Limiting
    if (
      lowerMessage.includes('rate limit') ||
      lowerMessage.includes('too many requests') ||
      lowerMessage.includes('429')
    ) {
      return new ScraperError(ErrorCode.RATE_LIMIT_EXCEEDED, message, {
        retryable: true,
        context,
        originalError,
      });
    }

    // Network Errors
    if (
      lowerMessage.includes('network') ||
      lowerMessage.includes('connection refused') ||
      lowerMessage.includes('econnrefused') ||
      lowerMessage.includes('socket hang up') ||
      lowerMessage.includes('fetch failed')
    ) {
      return new ScraperError(ErrorCode.NETWORK_ERROR, message, {
        retryable: true,
        context,
        originalError,
      });
    }

    // Timeouts
    if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out')) {
      return new ScraperError(ErrorCode.TIMEOUT, message, {
        retryable: true,
        context,
        originalError,
      });
    }

    // Authentication
    if (
      lowerMessage.includes('auth') ||
      lowerMessage.includes('login') ||
      lowerMessage.includes('unauthorized') ||
      lowerMessage.includes('401') ||
      lowerMessage.includes('403')
    ) {
      return new ScraperError(ErrorCode.AUTH_FAILED, message, {
        retryable: false,
        context,
        originalError,
      });
    }

    // Browser/Puppeteer
    if (
      lowerMessage.includes('puppeteer') ||
      lowerMessage.includes('chromium') ||
      lowerMessage.includes('browser') ||
      lowerMessage.includes('target closed') ||
      lowerMessage.includes('session closed')
    ) {
      return new ScraperError(ErrorCode.BROWSER_CRASHED, message, {
        retryable: true,
        context,
        originalError,
      });
    }

    // Navigation
    if (lowerMessage.includes('navigation') || lowerMessage.includes('navigating')) {
      return new ScraperError(ErrorCode.NAVIGATION_FAILED, message, {
        retryable: true,
        context,
        originalError,
      });
    }

    // Selectors
    if (lowerMessage.includes('selector') || lowerMessage.includes('element')) {
      return new ScraperError(ErrorCode.ELEMENT_NOT_FOUND, message, {
        retryable: true,
        context,
        originalError,
      });
    }

    return new ScraperError(ErrorCode.UNKNOWN_ERROR, message, {
      retryable: false,
      context,
      originalError,
    });
  }

  static isRateLimit(error: unknown): boolean {
    const classified = ErrorClassifier.classify(error);
    return classified.code === ErrorCode.RATE_LIMIT_EXCEEDED;
  }

  static isNetworkError(error: unknown): boolean {
    const classified = ErrorClassifier.classify(error);
    return (
      classified.code === ErrorCode.NETWORK_ERROR ||
      classified.code === ErrorCode.TIMEOUT ||
      classified.code === ErrorCode.DNS_ERROR ||
      classified.code === ErrorCode.CONNECTION_REFUSED
    );
  }
}

// Deprecated function alias for backward compatibility
export function classifyError(error: any): ClassifiedError {
  const se = ErrorClassifier.classify(error);
  // Map ScraperError back to ClassifiedError
  let type = ErrorType.UNKNOWN;
  if (se.code === ErrorCode.NETWORK_ERROR) type = ErrorType.NETWORK;
  if (se.code === ErrorCode.RATE_LIMIT_EXCEEDED) type = ErrorType.RATE_LIMIT;
  if (se.code === ErrorCode.AUTH_FAILED) type = ErrorType.AUTH;
  if (se.code === ErrorCode.TIMEOUT) type = ErrorType.TIMEOUT;
  if (se.code === ErrorCode.NOT_FOUND) type = ErrorType.NOT_FOUND;
  
  return {
    type,
    message: se.message,
    retryable: se.retryable,
    shouldSwitchProxy: type === ErrorType.NETWORK || type === ErrorType.TIMEOUT || type === ErrorType.PROXY,
  };
}

// ==========================================
// Part 4: Error Utilities
// ==========================================

export function handleError(error: unknown, context?: Record<string, any>): ScraperError {
  if (error instanceof ScraperError) {
    if (context && Object.keys(context).length > 0) Object.assign(error.context, context);
    return error;
  }
  const scraperError = ErrorClassifier.classify(error);
  if (context && Object.keys(context).length > 0) Object.assign(scraperError.context, context);
  return scraperError;
}

export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  errorMessage: string,
  errorCode?: ErrorCode,
  context?: Record<string, any>,
): Promise<T> {
  try {
    return await fn();
  } catch (error: unknown) {
    const classifiedError = handleError(error, context);
    if (errorMessage && !(error instanceof ScraperError)) {
      throw new ScraperError(
        errorCode || classifiedError.code,
        `${errorMessage}: ${classifiedError.message}`,
        {
          retryable: classifiedError.retryable,
          originalError: classifiedError.originalError || (error instanceof Error ? error : undefined),
          context: { ...classifiedError.context, ...context },
        },
      );
    }
    throw classifiedError;
  }
}

export function createErrorResult(
  error: unknown,
  operation?: string,
): { success: false; error: string; code?: ErrorCode; retryable?: boolean } {
  const scraperError = handleError(error, operation ? { operation } : undefined);
  return {
    success: false,
    error: scraperError.getUserMessage(),
    code: scraperError.code,
    retryable: scraperError.retryable,
  };
}

export function isRecoverableError(error: unknown): boolean {
  const scraperError = handleError(error);
  return scraperError.isRecoverable();
}

export function logError(
  error: unknown,
  logger: (message: string, level?: string) => void = console.error,
): void {
  const scraperError = handleError(error);
  logger(`[${scraperError.code}] ${scraperError.message}`, 'error');
  if (scraperError.originalError) {
    logger(`Original error: ${scraperError.originalError.message}`, 'debug');
  }
  if (Object.keys(scraperError.context).length > 0) {
    logger(`Context: ${JSON.stringify(scraperError.context, null, 2)}`, 'debug');
  }
}

export interface SuccessResult<T> {
  success: true;
  data: T;
}

export interface ErrorResult {
  success: false;
  error: string;
  code?: ErrorCode;
  retryable?: boolean;
}

export type Result<T> = SuccessResult<T> | ErrorResult;

export function successResult<T>(data: T): SuccessResult<T> {
  return { success: true, data };
}

export function errorToResult(error: unknown): ErrorResult {
  return createErrorResult(error);
}

// ==========================================
// Part 5: ScraperErrors Factory
// ==========================================

export const ScraperErrors = {
  NetworkError: (message: string, context?: ErrorContext, originalError?: Error) =>
    new ScraperError(ErrorCode.NETWORK_ERROR, message, {
      retryable: true,
      context,
      originalError,
    }),

  RateLimitError: (message: string = 'Rate limit exceeded', context?: ErrorContext) =>
    new ScraperError(ErrorCode.RATE_LIMIT_EXCEEDED, message, {
      retryable: true,
      context,
    }),

  AuthError: (message: string, context?: ErrorContext) =>
    new ScraperError(ErrorCode.AUTH_FAILED, message, {
      retryable: false,
      context,
    }),

  TimeoutError: (message: string, context?: ErrorContext) =>
    new ScraperError(ErrorCode.TIMEOUT, message, {
      retryable: true,
      context,
    }),

  BrowserError: (message: string, context?: ErrorContext, originalError?: Error) =>
    new ScraperError(ErrorCode.BROWSER_CRASHED, message, {
      retryable: true,
      context,
      originalError,
    }),

  DataError: (message: string, context?: ErrorContext) =>
    new ScraperError(ErrorCode.DATA_EXTRACTION_FAILED, message, {
      retryable: false,
      context,
    }),

  ApiError: (message: string, statusCode?: number, context?: ErrorContext) =>
    new ScraperError(ErrorCode.API_ERROR, message, {
      retryable: statusCode ? [429, 500, 502, 503, 504].includes(statusCode) : true,
      statusCode,
      context,
    }),

  apiClientNotInitialized: () =>
    new ScraperError(ErrorCode.INTERNAL_ERROR, 'API Client not initialized', {
      retryable: false,
    }),

  browserNotInitialized: () =>
    new ScraperError(ErrorCode.INTERNAL_ERROR, 'Browser not initialized', {
      retryable: false,
    }),

  pageNotAvailable: () =>
    new ScraperError(ErrorCode.INTERNAL_ERROR, 'Page not available', {
      retryable: false,
    }),

  invalidConfiguration: (message: string, context?: ErrorContext) =>
    new ScraperError(ErrorCode.CONFIG_ERROR, message, {
      retryable: false,
      context,
    }),

  apiRequestFailed: (message: string, statusCode?: number, context?: ErrorContext) =>
    new ScraperError(ErrorCode.API_ERROR, message, {
      retryable: statusCode ? [429, 500, 502, 503, 504].includes(statusCode) : true,
      statusCode,
      context,
    }),

  rateLimitExceeded: (message: string = 'Rate limit exceeded', context?: ErrorContext) =>
    new ScraperError(ErrorCode.RATE_LIMIT_EXCEEDED, message, {
      retryable: true,
      context,
    }),

  userNotFound: (username: string, context?: ErrorContext) =>
    new ScraperError(ErrorCode.NOT_FOUND, `User not found: ${username}`, {
      retryable: false,
      context: { ...context, username },
    }),

  dataExtractionFailed: (message: string, context?: ErrorContext) =>
    new ScraperError(ErrorCode.DATA_EXTRACTION_FAILED, message, {
      retryable: false,
      context,
    }),

  cookieLoadFailed: (message: string, context?: ErrorContext) =>
    new ScraperError(ErrorCode.INTERNAL_ERROR, message, {
      retryable: false,
      context,
    }),

  navigationFailed: (url: string | Error, error?: Error) =>
    typeof url === 'string'
      ? new ScraperError(ErrorCode.NAVIGATION_FAILED, `Navigation failed: ${url}`, {
          retryable: true,
          context: { url },
          originalError: error,
        })
      : new ScraperError(ErrorCode.NAVIGATION_FAILED, `Navigation failed: ${url.message}`, {
          retryable: true,
          originalError: url,
        }),

  authenticationFailed: (message: string, statusCode?: number, context?: ErrorContext) =>
    new ScraperError(ErrorCode.AUTH_FAILED, message, {
      retryable: false,
      statusCode,
      context,
    }),
};

// ==========================================
// Part 6: Error Snapshotter
// ==========================================

export class ErrorSnapshotter {
  private snapshotDir: string;

  constructor(baseDir: string = 'output/errors') {
    this.snapshotDir = path.isAbsolute(baseDir) ? baseDir : path.join(process.cwd(), baseDir);
    this.ensureDirExists();
  }

  private ensureDirExists() {
    if (!fs.existsSync(this.snapshotDir)) {
      fs.mkdirSync(this.snapshotDir, { recursive: true });
    }
  }

  async capture(page: Page, error: Error, contextLabel: string = 'unknown'): Promise<string[]> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const sanitizedLabel = contextLabel.replace(/[^a-z0-9-]/gi, '_');
      const errorName = error.name || 'Error';
      const baseFilename = `${timestamp}_${sanitizedLabel}_${errorName}`;

      const screenshotPath = path.join(this.snapshotDir, `${baseFilename}.jpg`);
      const htmlPath = path.join(this.snapshotDir, `${baseFilename}.html`);
      const savedFiles: string[] = [];

      try {
        await page.screenshot({
          path: screenshotPath,
          type: 'jpeg',
          quality: 60,
          fullPage: true,
        });
        savedFiles.push(screenshotPath);
      } catch (e) {
        // ignore
      }

      try {
        const htmlContent = await page.content();
        fs.writeFileSync(htmlPath, htmlContent, 'utf-8');
        savedFiles.push(htmlPath);
      } catch (e) {
        // ignore
      }

      try {
        const errorLogPath = path.join(this.snapshotDir, `${baseFilename}.log`);
        const errorLog = `Error: ${error.message}\nStack: ${error.stack}\nContext: ${contextLabel}\nTime: ${new Date().toISOString()}`;
        fs.writeFileSync(errorLogPath, errorLog, 'utf-8');
        savedFiles.push(errorLogPath);
      } catch (e) {
        // ignore
      }

      return savedFiles;
    } catch (criticalError) {
      return [];
    }
  }
}
