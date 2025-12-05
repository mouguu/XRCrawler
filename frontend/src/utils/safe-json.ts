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

export default safeJsonParse;
