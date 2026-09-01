import * as core from '@actions/core';
import { setTimeout as delay } from 'node:timers/promises';

// Resolve the Pulumi CLI version to install when the caller did not pin one.
export const LATEST_VERSION_URL = 'https://www.pulumi.com/latest-version';

const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;

// `fetch` rejects with a bare `TypeError: fetch failed` and hides the real
// reason (ENOTFOUND, ECONNRESET, certificate errors, ...) on `cause`. Unfold it
// so the failure names something the user can act on.
function describeError(err: unknown): string {
    const message = err instanceof Error ? err.message : String(err);
    const cause = (err as { cause?: unknown })?.cause;
    return cause instanceof Error ? `${message}: ${cause.message}` : message;
}

// Transient server-side failures are worth another attempt. Anything else -- a
// 404, a 403 -- will answer the same way however often we ask.
function isRetriableStatus(status: number): boolean {
    return status >= 500 || status === 408 || status === 429;
}

export async function fetchLatestVersion(): Promise<string> {
    const prefix = `failed to fetch the latest Pulumi CLI version from ${LATEST_VERSION_URL}`;

    for (let attempt = 1; ; attempt++) {
        const lastAttempt = attempt === MAX_ATTEMPTS;
        let response: Response;

        try {
            response = await fetch(LATEST_VERSION_URL);
        } catch (err) {
            // The request never reached the server, so nothing has been decided
            // yet and another attempt may well land.
            if (lastAttempt) {
                throw new Error(`${prefix}: ${describeError(err)}`, { cause: err });
            }
            core.info(`${prefix} (attempt ${attempt}/${MAX_ATTEMPTS}): ${describeError(err)}`);
            await delay(RETRY_BASE_DELAY_MS * attempt);
            continue;
        }

        if (response.ok) {
            return (await response.text()).trim();
        }

        const message = `${prefix}: HTTP ${response.status} ${response.statusText}`.trimEnd();
        if (lastAttempt || !isRetriableStatus(response.status)) {
            throw new Error(message);
        }
        core.info(`${message} (attempt ${attempt}/${MAX_ATTEMPTS})`);
        await delay(RETRY_BASE_DELAY_MS * attempt);
    }
}
