interface RetryOptions {
    maxAttempts?: number;    // default: 3
    baseDelayMs?: number;    // default: 1000ms
    shouldRetry?: (error: unknown) => boolean;
}

export async function withRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
): Promise<T> {
    const {
        maxAttempts = 3,
        baseDelayMs = 1000,
        shouldRetry = isRetryableError,
    } = options;

    let lastError: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            const isLast = attempt === maxAttempts - 1;
            if (isLast || !shouldRetry(error)) {
                throw error;
            }

            const delay = Math.pow(2, attempt) * baseDelayMs;
            const jitter = Math.random() * baseDelayMs * 0.5;
            const waitMs = delay + jitter;

            console.warn(
                `[Retry] Attempt ${attempt + 1}/${maxAttempts} failed. Retrying in ${Math.round(waitMs)}ms...`,
                error
            );

            await new Promise(resolve => setTimeout(resolve, waitMs));
        }
    }

    throw lastError;
}

// Determines which errors are worth retrying.
// Exported so callers can extend or compose it with service-specific logic.
export function isRetryableError(error: unknown): boolean {
    // SyntaxError means the model returned malformed/unparseable JSON.
    // Re-generating the response often produces a valid one.
    if (error instanceof SyntaxError) return true;

    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        // Retry on rate limiting, server errors, and network issues.
        return (
            message.includes('429') ||
            message.includes('503') ||
            message.includes('502') ||
            message.includes('rate') ||
            message.includes('network') ||
            message.includes('timeout') ||
            message.includes('fetch')
        );
    }
    return false;
}