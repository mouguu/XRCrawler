import { ScraperErrors } from '../core/errors';

/**
 * Decorator to retry a method on network errors or specific exceptions.
 * @param maxRetries Maximum number of retries
 * @param delay Initial delay in ms
 * @param backoff Backoff factor
 */
export function RetryOnNetworkError(
    maxRetries: number = 3,
    delay: number = 1000,
    backoff: number = 2.0
) {
    return function (
        target: any,
        propertyKey: string,
        descriptor: PropertyDescriptor
    ) {
        const originalMethod = descriptor.value;

        descriptor.value = async function (...args: any[]) {
            let currentDelay = delay;
            let lastError: any;

            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                try {
                    return await originalMethod.apply(this, args);
                } catch (error: any) {
                    lastError = error;
                    
                    // Check if it's a network error or transient API error
                    const isNetworkError = error.message.includes('network') || 
                                           error.message.includes('timeout') ||
                                           error.message.includes('ECONNRESET');
                    
                    const isTransientApiError = error.status === 500 || 
                                                error.status === 502 || 
                                                error.status === 503;

                    if (attempt < maxRetries && (isNetworkError || isTransientApiError)) {
                        console.warn(
                            `[Retry] Method ${propertyKey} failed (attempt ${attempt + 1}/${maxRetries + 1}): ${error.message}. Retrying in ${currentDelay}ms...`
                        );
                        await new Promise(resolve => setTimeout(resolve, currentDelay));
                        currentDelay *= backoff;
                    } else {
                        throw error;
                    }
                }
            }
            throw lastError;
        };

        return descriptor;
    };
}

/**
 * Decorator to handle rate limits by waiting or throwing specific errors.
 * @param waitTime Default wait time in ms if rate limit is hit
 */
export function HandleRateLimit(waitTime: number = 15 * 60 * 1000) {
    return function (
        target: any,
        propertyKey: string,
        descriptor: PropertyDescriptor
    ) {
        const originalMethod = descriptor.value;

        descriptor.value = async function (...args: any[]) {
            try {
                return await originalMethod.apply(this, args);
            } catch (error: any) {
                if (error.status === 429 || error.message.includes('429')) {
                    console.warn(`[RateLimit] Method ${propertyKey} hit rate limit.`);
                    // In a real scenario, we might want to trigger session rotation here
                    // or throw a specific RateLimitError that the caller can handle.
                    // For now, we rethrow a standardized error.
                    throw ScraperErrors.rateLimitExceeded();
                }
                throw error;
            }
        };

        return descriptor;
    };
}
