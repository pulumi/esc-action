import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { fetchLatestVersion, LATEST_VERSION_URL } from './latest-version.js';

const urlPattern = new RegExp(LATEST_VERSION_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

// Swap in a stub `fetch` for the duration of one test.
function withFetch(stub: typeof fetch, body: () => Promise<void>): Promise<void> {
    const original = globalThis.fetch;
    globalThis.fetch = stub;
    return body().finally(() => {
        globalThis.fetch = original;
    });
}

// The shape undici throws when the request never reaches the server: a
// TypeError whose message is the bare string 'fetch failed', with the real
// reason hidden on `cause`.
function fetchFailed(): TypeError {
    const err = new TypeError('fetch failed');
    (err as { cause?: unknown }).cause = Object.assign(
        new Error('getaddrinfo ENOTFOUND www.pulumi.com'),
        { code: 'ENOTFOUND' },
    );
    return err;
}

test('returns the trimmed latest version', async () => {
    await withFetch(
        (async () => new Response('3.255.0\n')) as typeof fetch,
        async () => {
            assert.equal(await fetchLatestVersion(), '3.255.0');
        },
    );
});

test('names the URL and the underlying cause when the lookup fails', async () => {
    await withFetch(
        (async () => {
            throw fetchFailed();
        }) as typeof fetch,
        async () => {
            await assert.rejects(fetchLatestVersion(), (err: Error) => {
                assert.notEqual(
                    err.message,
                    'fetch failed',
                    'a bare "fetch failed" tells the user nothing about what was being fetched',
                );
                assert.match(err.message, urlPattern);
                assert.match(err.message, /ENOTFOUND/);
                return true;
            });
        },
    );
});

test('rejects an error response instead of treating the error page as a version', async () => {
    await withFetch(
        (async () => new Response('<html>502 Bad Gateway</html>', { status: 502, statusText: 'Bad Gateway' })) as typeof fetch,
        async () => {
            await assert.rejects(fetchLatestVersion(), (err: Error) => {
                assert.match(err.message, urlPattern);
                assert.match(err.message, /502/);
                return true;
            });
        },
    );
});
