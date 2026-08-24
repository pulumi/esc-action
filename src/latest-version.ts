// Resolve the Pulumi CLI version to install when the caller did not pin one.
export const LATEST_VERSION_URL = 'https://www.pulumi.com/latest-version';

// `fetch` rejects with a bare `TypeError: fetch failed` and hides the real
// reason (ENOTFOUND, ECONNRESET, certificate errors, ...) on `cause`. Unfold it
// so the failure names something the user can act on.
function describeError(err: unknown): string {
    const message = err instanceof Error ? err.message : String(err);
    const cause = (err as { cause?: unknown })?.cause;
    return cause instanceof Error ? `${message}: ${cause.message}` : message;
}

export async function fetchLatestVersion(): Promise<string> {
    let response: Response;
    try {
        response = await fetch(LATEST_VERSION_URL);
    } catch (err) {
        throw new Error(
            `failed to fetch the latest Pulumi CLI version from ${LATEST_VERSION_URL}: ${describeError(err)}`,
            { cause: err },
        );
    }

    if (!response.ok) {
        throw new Error(
            `failed to fetch the latest Pulumi CLI version from ${LATEST_VERSION_URL}: ` +
            `HTTP ${response.status} ${response.statusText}`.trimEnd(),
        );
    }

    return (await response.text()).trim();
}
