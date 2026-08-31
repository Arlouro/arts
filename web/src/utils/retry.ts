interface RetryOptions {
    maxAttempts?: number;    // default: 3
    baseDelayMs?: number;    // default: 1000ms
    shouldRetry?: (error: unknown) => boolean;
}
export class HttpError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = 'HttpError';
        this.status = status;
    }
}

function isRetryableStatus(status: number): boolean {
    return (
        status === 408 ||   // request timeout
        status === 425 ||   // too early
        status === 429 ||   // rate limited
        status >= 500       // the service failed, not the request
    );
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
export function isRetryableError(error: unknown): boolean {
    if ((error as { name?: string } | null)?.name === 'AbortError') return false;

    if (error instanceof HttpError) return isRetryableStatus(error.status);

    if (error instanceof SyntaxError) return true;

    if (error instanceof TypeError) return true;

    if (error instanceof Error) return matchesRetryableMessage(error.message);

    return false;
}

export function matchesRetryableMessage(message: string): boolean {
    const m = message.toLowerCase();
    return (
        m.includes('429') ||
        m.includes('503') ||
        m.includes('502') ||
        m.includes('rate') ||
        m.includes('network') ||
        m.includes('timeout') ||
        m.includes('fetch')
    );
}
