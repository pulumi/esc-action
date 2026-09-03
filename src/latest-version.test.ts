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

// A stub that plays the given responses in order, one per call, alongside a
// counter so a test can assert how many times it was asked.
function sequence(...steps: Array<() => Response>) {
    const calls = { count: 0 };
    const stub = (async () => {
        const step = steps[calls.count++];
        if (!step) {
            throw new Error('fetch called more times than the test scripted');
        }
        return step();
    }) as typeof fetch;
    return [stub, calls] as const;
}

test('retries a network failure and returns the version once it succeeds', async () => {
    const [stub, calls] = sequence(
        () => { throw fetchFailed(); },
        () => new Response('3.260.0\n'),
    );
    await withFetch(stub, async () => {
        assert.equal(await fetchLatestVersion(), '3.260.0');
        assert.equal(calls.count, 2);
    });
});

test('retries a 5xx and returns the version once it succeeds', async () => {
    const [stub, calls] = sequence(
        () => new Response('<html>502 Bad Gateway</html>', { status: 502, statusText: 'Bad Gateway' }),
        () => new Response('3.260.0\n'),
    );
    await withFetch(stub, async () => {
        assert.equal(await fetchLatestVersion(), '3.260.0');
        assert.equal(calls.count, 2);
    });
});

test('gives up after a bounded number of attempts rather than retrying forever', async () => {
    const [stub, calls] = sequence(
        () => { throw fetchFailed(); },
        () => { throw fetchFailed(); },
        () => { throw fetchFailed(); },
    );
    await withFetch(stub, async () => {
        await assert.rejects(fetchLatestVersion(), (err: Error) => {
            assert.match(err.message, /ENOTFOUND/);
            return true;
        });
        assert.equal(calls.count, 3);
    });
});

test('does not retry a response that will never change', async () => {
    const [stub, calls] = sequence(
        () => new Response('not found', { status: 404, statusText: 'Not Found' }),
    );
    await withFetch(stub, async () => {
        await assert.rejects(fetchLatestVersion(), (err: Error) => {
            assert.match(err.message, /404/);
            return true;
        });
        assert.equal(calls.count, 1, 'a 404 answers the same way however often we ask');
    });
});
