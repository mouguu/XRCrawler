/**
 * Safe JSON Parser - Prototype Pollution Protection
 * 
 * Uses secure-json-parse to prevent __proto__ and constructor.prototype attacks.
 * This module provides a drop-in replacement for JSON.parse with security hardening.
 * 
 * @see https://github.com/fastify/secure-json-parse
 */

import sjson from 'secure-json-parse';

/**
 * Options for safe JSON parsing
 */
export interface SafeParseOptions {
  /**
   * Remove __proto__ keys from the parsed object (default: true)
   */
  protoAction?: 'remove' | 'error' | 'ignore';
  
  /**
   * Remove constructor.prototype keys from the parsed object (default: true)
   */
  constructorAction?: 'remove' | 'error' | 'ignore';
}

const DEFAULT_OPTIONS: SafeParseOptions = {
  protoAction: 'remove',
  constructorAction: 'remove',
};

/**
 * Safely parse JSON string with prototype pollution protection.
 * 
 * @param text - The JSON string to parse
 * @param reviver - Optional reviver function (same as JSON.parse)
 * @param options - Security options for handling dangerous keys
 * @returns Parsed object with dangerous prototype keys removed
 * 
 * @example
 * ```typescript
 * import { safeJsonParse } from '../utils/safe-json';
 * 
 * // Safe: __proto__ keys are automatically removed
 * const data = safeJsonParse('{"__proto__": {"polluted": true}, "name": "test"}');
 * // Result: { name: "test" }
 * 
 * // Also safe against constructor.prototype attacks
 * const data2 = safeJsonParse('{"constructor": {"prototype": {"polluted": true}}}');
 * // Result: {} (dangerous keys removed)
 * ```
 */
export function safeJsonParse<T = unknown>(
  text: string,
  reviver?: (key: string, value: unknown) => unknown,
  options: SafeParseOptions = DEFAULT_OPTIONS
): T {
  return sjson.parse(text, reviver, {
    protoAction: options.protoAction || 'remove',
    constructorAction: options.constructorAction || 'remove',
  }) as T;
}

/**
 * Safely parse JSON with error handling - returns null on failure.
 * Useful for parsing untrusted input where parse errors are expected.
 * 
 * @param text - The JSON string to parse
 * @param options - Security options for handling dangerous keys
 * @returns Parsed object or null if parsing fails
 * 
 * @example
 * ```typescript
 * const data = safeJsonParseSafe(userInput);
 * if (data === null) {
 *   console.log('Invalid JSON');
 * }
 * ```
 */
export function safeJsonParseSafe<T = unknown>(
  text: string,
  options: SafeParseOptions = DEFAULT_OPTIONS
): T | null {
  try {
    return safeJsonParse<T>(text, undefined, options);
  } catch {
    return null;
  }
}

/**
 * Check if a parsed object was potentially polluted.
 * Use this for additional validation after parsing.
 * 
 * @param obj - Object to check
 * @returns true if the object appears to have pollution attempts
 */
export function hasPollutionAttempt(obj: unknown): boolean {
  if (obj === null || typeof obj !== 'object') {
    return false;
  }
  
  const suspicious = ['__proto__', 'constructor', 'prototype'];
  
  function checkObject(o: Record<string, unknown>): boolean {
    for (const key of Object.keys(o)) {
      if (suspicious.includes(key)) {
        return true;
      }
      if (o[key] && typeof o[key] === 'object') {
        if (checkObject(o[key] as Record<string, unknown>)) {
          return true;
        }
      }
    }
    return false;
  }
  
  return checkObject(obj as Record<string, unknown>);
}

// Re-export the underlying secure-json-parse for advanced usage
export { sjson as secureJson };

// Default export for convenience
export default safeJsonParse;
