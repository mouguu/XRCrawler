/**
 * 统一的错误处理系统
 * 企业级错误管理：类型化、可追踪、可恢复
 */

export enum ErrorCode {
  // 网络错误
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  CONNECTION_REFUSED = 'CONNECTION_REFUSED',
  
  // 认证错误
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  AUTH_FAILED = 'AUTH_FAILED',
  COOKIE_LOAD_FAILED = 'COOKIE_LOAD_FAILED',
  COOKIE_INVALID = 'COOKIE_INVALID',
  SESSION_INVALID = 'SESSION_INVALID',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  
  // 速率限制
  RATE_LIMIT = 'RATE_LIMIT',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  
  // API 错误
  API_ERROR = 'API_ERROR',
  API_REQUEST_FAILED = 'API_REQUEST_FAILED',
  API_NOT_FOUND = 'API_NOT_FOUND',
  API_BAD_REQUEST = 'API_BAD_REQUEST',
  API_CLIENT_NOT_INITIALIZED = 'API_CLIENT_NOT_INITIALIZED',
  
  // 浏览器错误
  BROWSER_ERROR = 'BROWSER_ERROR',
  BROWSER_NOT_INITIALIZED = 'BROWSER_NOT_INITIALIZED',
  PAGE_NOT_AVAILABLE = 'PAGE_NOT_AVAILABLE',
  PAGE_ERROR = 'PAGE_ERROR',
  NAVIGATION_FAILED = 'NAVIGATION_FAILED',
  SELECTOR_NOT_FOUND = 'SELECTOR_NOT_FOUND',
  
  // 数据错误
  DATA_EXTRACTION_FAILED = 'DATA_EXTRACTION_FAILED',
  DATA_PARSE_ERROR = 'DATA_PARSE_ERROR',
  DATA_VALIDATION_ERROR = 'DATA_VALIDATION_ERROR',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  TWEET_NOT_FOUND = 'TWEET_NOT_FOUND',
  
  // 配置错误
  INVALID_CONFIGURATION = 'INVALID_CONFIGURATION',
  INVALID_CONFIG = 'INVALID_CONFIG',
  MISSING_CONFIG = 'MISSING_CONFIG',
  MISSING_REQUIRED_PARAMETER = 'MISSING_REQUIRED_PARAMETER',
  
  // 系统错误
  SYSTEM_ERROR = 'SYSTEM_ERROR',
  FILE_SYSTEM_ERROR = 'FILE_SYSTEM_ERROR',
  MEMORY_ERROR = 'MEMORY_ERROR',
  
  // 通用错误
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  OPERATION_CANCELLED = 'OPERATION_CANCELLED'
}

export interface ErrorContext {
  [key: string]: any;
}

/**
 * 统一的爬虫错误类
 */
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
    } = {}
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

  /**
   * 从 HTTP 响应创建错误
   */
  static fromHttpResponse(
    response: Response,
    context?: ErrorContext
  ): ScraperError {
    const status = response.status;
    let code: ErrorCode;
    let message: string;
    let retryable = false;

    switch (status) {
      case 401:
      case 403:
        code = ErrorCode.AUTH_FAILED;
        message = `Authentication failed (${status})`;
        break;
      case 404:
        code = ErrorCode.API_NOT_FOUND;
        message = `Resource not found (${status})`;
        retryable = false;
        break;
      case 429:
        code = ErrorCode.RATE_LIMIT;
        message = `Rate limit exceeded (${status})`;
        retryable = true;
        break;
      case 500:
      case 502:
      case 503:
      case 504:
        code = ErrorCode.API_ERROR;
        message = `Server error (${status})`;
        retryable = true;
        break;
      default:
        code = ErrorCode.API_ERROR;
        message = `API request failed (${status})`;
        retryable = status >= 500;
    }

    return new ScraperError(code, message, {
      retryable,
      statusCode: status,
      context: {
        ...context,
        statusCode: status,
        statusText: response.statusText
      }
    });
  }

  /**
   * 从原生 Error 创建 ScraperError
   */
  static fromError(
    error: Error,
    code: ErrorCode = ErrorCode.UNKNOWN_ERROR,
    retryable: boolean = false
  ): ScraperError {
    return new ScraperError(code, error.message, {
      retryable,
      originalError: error
    });
  }

  /**
   * 检查是否为速率限制错误
   */
  static isRateLimitError(error: Error): boolean {
    if (error instanceof ScraperError) {
      return error.code === ErrorCode.RATE_LIMIT || 
             error.code === ErrorCode.RATE_LIMIT_EXCEEDED;
    }
    const msg = error.message.toLowerCase();
    return msg.includes('rate limit') || 
           msg.includes('429') || 
           msg.includes('too many requests');
  }

  /**
   * 检查是否为认证错误
   */
  static isAuthError(error: Error): boolean {
    if (error instanceof ScraperError) {
      return error.code === ErrorCode.AUTHENTICATION_FAILED ||
             error.code === ErrorCode.AUTH_FAILED ||
             error.code === ErrorCode.COOKIE_LOAD_FAILED ||
             error.code === ErrorCode.COOKIE_INVALID ||
             error.code === ErrorCode.SESSION_INVALID ||
             error.code === ErrorCode.SESSION_EXPIRED;
    }
    const msg = error.message.toLowerCase();
    return msg.includes('auth') || 
           msg.includes('401') || 
           msg.includes('403') ||
           msg.includes('cookie');
  }

  /**
   * 检查是否为网络错误
   */
  static isNetworkError(error: Error): boolean {
    if (error instanceof ScraperError) {
      return error.code === ErrorCode.NETWORK_ERROR ||
             error.code === ErrorCode.TIMEOUT ||
             error.code === ErrorCode.CONNECTION_REFUSED;
    }
    const msg = error.message.toLowerCase();
    return msg.includes('network') ||
           msg.includes('timeout') ||
           msg.includes('connection') ||
           msg.includes('econnrefused');
  }

  /**
   * 检查是否为可恢复的错误
   */
  isRecoverable(): boolean {
    return this.retryable || [
      ErrorCode.RATE_LIMIT_EXCEEDED,
      ErrorCode.API_REQUEST_FAILED,
      ErrorCode.NAVIGATION_FAILED,
      ErrorCode.NETWORK_ERROR,
      ErrorCode.TIMEOUT
    ].includes(this.code);
  }

  /**
   * 转换为 JSON（用于日志和序列化）
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      statusCode: this.statusCode,
      stack: this.stack,
      originalError: this.originalError ? {
        name: this.originalError.name,
        message: this.originalError.message,
        stack: this.originalError.stack
      } : undefined
    };
  }

  /**
   * 获取用户友好的错误消息
   */
  getUserMessage(): string {
    switch (this.code) {
      case ErrorCode.RATE_LIMIT:
      case ErrorCode.RATE_LIMIT_EXCEEDED:
        return '已达到速率限制，请稍后重试或切换账户';
      case ErrorCode.AUTHENTICATION_FAILED:
      case ErrorCode.AUTH_FAILED:
      case ErrorCode.COOKIE_LOAD_FAILED:
      case ErrorCode.COOKIE_INVALID:
      case ErrorCode.SESSION_EXPIRED:
        return '认证失败，请检查 cookies 是否有效';
      case ErrorCode.NETWORK_ERROR:
      case ErrorCode.TIMEOUT:
        return '网络连接失败，请检查网络设置';
      case ErrorCode.API_ERROR:
      case ErrorCode.API_REQUEST_FAILED:
        return 'API 请求失败，请稍后重试';
      default:
        return this.message || '发生未知错误';
    }
  }
}

/**
 * 错误工厂函数（保持向后兼容）
 */
export const ScraperErrors = {
  authenticationFailed: (message: string = 'Authentication failed', statusCode?: number) =>
    new ScraperError(ErrorCode.AUTHENTICATION_FAILED, message, { statusCode, retryable: false }),
  
  cookieLoadFailed: (message: string = 'Failed to load cookies', cause?: Error) =>
    new ScraperError(ErrorCode.COOKIE_LOAD_FAILED, message, { originalError: cause, retryable: false }),
  
  rateLimitExceeded: (message: string = 'Rate limit exceeded') =>
    new ScraperError(ErrorCode.RATE_LIMIT_EXCEEDED, message, { statusCode: 429, retryable: true }),
  
  apiRequestFailed: (message: string, statusCode?: number, context?: ErrorContext) => {
    // Enhanced error message for 400 errors that might indicate Query ID expiration
    let enhancedMessage = message;
    let enhancedContext = { ...context };
    
    if (statusCode === 400 && context?.operation) {
      const operation = context.operation;
      enhancedMessage = `${message}\n⚠️  提示：如果此错误持续出现，可能是 Query ID 已过期。\n请参考 docs/maintaining-query-ids.md 更新 ${operation} 的 Query ID。`;
      enhancedContext = {
        ...context,
        possibleQueryIdExpiration: true,
        maintenanceGuide: 'docs/maintaining-query-ids.md'
      };
    }
    
    return new ScraperError(
      ErrorCode.API_REQUEST_FAILED,
      enhancedMessage,
      {
        retryable: statusCode === 429 || statusCode === 502 || statusCode === 503,
        statusCode,
        context: enhancedContext,
      }
    );
  },
  
  apiClientNotInitialized: () =>
    new ScraperError(ErrorCode.API_CLIENT_NOT_INITIALIZED, 'API Client not initialized', { retryable: false }),
  
  browserNotInitialized: () =>
    new ScraperError(ErrorCode.BROWSER_NOT_INITIALIZED, 'Browser not initialized', { retryable: false }),
  
  pageNotAvailable: () =>
    new ScraperError(ErrorCode.PAGE_NOT_AVAILABLE, 'Page not available', { retryable: false }),
  
  navigationFailed: (url: string, cause?: Error) =>
    new ScraperError(ErrorCode.NAVIGATION_FAILED, `Navigation failed: ${url}`, { context: { url }, originalError: cause, retryable: true }),
  
  dataExtractionFailed: (message: string, context?: ErrorContext) =>
    new ScraperError(ErrorCode.DATA_EXTRACTION_FAILED, message, { context, retryable: false }),
  
  userNotFound: (username: string) =>
    new ScraperError(ErrorCode.USER_NOT_FOUND, `User not found: ${username}`, { context: { username }, retryable: false }),
  
  tweetNotFound: (tweetId: string) =>
    new ScraperError(ErrorCode.TWEET_NOT_FOUND, `Tweet not found: ${tweetId}`, { context: { tweetId }, retryable: false }),
  
  invalidConfiguration: (message: string, context?: ErrorContext) =>
    new ScraperError(ErrorCode.INVALID_CONFIGURATION, message, { context, retryable: false }),
  
  missingRequiredParameter: (paramName: string) =>
    new ScraperError(ErrorCode.MISSING_REQUIRED_PARAMETER, `Missing required parameter: ${paramName}`, { context: { paramName }, retryable: false }),
  
  operationCancelled: () =>
    new ScraperError(ErrorCode.OPERATION_CANCELLED, 'Operation cancelled by user', { retryable: false }),
  
  unknown: (message: string, cause?: Error) =>
    new ScraperError(ErrorCode.UNKNOWN_ERROR, message, { originalError: cause, retryable: false })
};

/**
 * 错误分类器
 */
export class ErrorClassifier {
  /**
   * 分类错误并返回适当的错误代码
   */
  static classify(error: Error | unknown): ScraperError {
    if (error instanceof ScraperError) {
      return error;
    }

    if (error instanceof Error) {
      if (ScraperError.isRateLimitError(error)) {
        return new ScraperError(
          ErrorCode.RATE_LIMIT,
          error.message,
          { retryable: true, originalError: error }
        );
      }

      if (ScraperError.isAuthError(error)) {
        return new ScraperError(
          ErrorCode.AUTH_FAILED,
          error.message,
          { retryable: false, originalError: error }
        );
      }

      if (ScraperError.isNetworkError(error)) {
        return new ScraperError(
          ErrorCode.NETWORK_ERROR,
          error.message,
          { retryable: true, originalError: error }
        );
      }

      return ScraperError.fromError(error);
    }

    return new ScraperError(
      ErrorCode.UNKNOWN_ERROR,
      String(error),
      { retryable: false }
    );
  }
}

/**
 * 错误结果类型（用于统一返回格式）
 */
export interface ErrorResult {
  success: false;
  error: string;
  code?: ErrorCode;
  statusCode?: number;
  context?: ErrorContext;
}

/**
 * 成功结果类型
 */
export interface SuccessResult<T = any> {
  success: true;
  data: T;
}

/**
 * 统一结果类型
 */
export type Result<T = any> = SuccessResult<T> | ErrorResult;

/**
 * 将错误转换为统一的结果格式
 */
export function errorToResult(error: Error | ScraperError): ErrorResult {
  if (error instanceof ScraperError) {
    return {
      success: false,
      error: error.message,
      code: error.code,
      statusCode: error.statusCode,
      context: error.context
    };
  }
  
  return {
    success: false,
    error: error.message || 'Unknown error',
    code: ErrorCode.UNKNOWN_ERROR
  };
}

/**
 * 创建成功结果
 */
export function successResult<T>(data: T): SuccessResult<T> {
  return {
    success: true,
    data
  };
}
