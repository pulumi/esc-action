import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { collectSecretKeys, parseMaskMode } from './mask.js';

// A representative slice of `pulumi env open --format detailed` output: the root is the
// opened environment's esc.Value, and every node is wrapped as
// `{ "value": ..., "secret"?: true, "trace": {...} }`. Here API_KEY and the
// KUBECONFIG file resolved from secret sources; LOG_LEVEL is plaintext config.
function detailedFixture(): string {
    return JSON.stringify({
        value: {
            environmentVariables: {
                value: {
                    API_KEY: { value: 'abc123', secret: true, trace: {} },
                    LOG_LEVEL: { value: 'debug', trace: {} }
                },
                trace: {}
            },
            files: {
                value: {
                    KUBECONFIG: { value: '/tmp/esc-kube', secret: true, trace: {} }
                },
                trace: {}
            }
        },
        trace: {}
    });
}

test('parseMaskMode defaults to all when empty or unset (no regression)', () => {
    assert.equal(parseMaskMode(undefined), 'all');
    assert.equal(parseMaskMode(''), 'all');
    assert.equal(parseMaskMode('all'), 'all');
});

test('parseMaskMode accepts secrets and trims surrounding whitespace', () => {
    assert.equal(parseMaskMode('secrets'), 'secrets');
    assert.equal(parseMaskMode('  secrets  '), 'secrets');
});

test('parseMaskMode rejects anything else with a clear error', () => {
    for (const bad of ['secrets-only', 'none', 'true', 'All', 'SECRETS']) {
        assert.throws(() => parseMaskMode(bad), /Invalid value for 'mask'/);
    }
});

test('collectSecretKeys returns only keys from secret sources', () => {
    const keys = collectSecretKeys(detailedFixture());
    assert.deepEqual([...keys].sort(), ['API_KEY', 'KUBECONFIG']);
    assert.ok(!keys.has('LOG_LEVEL'), 'plaintext config must not be marked secret');
});

test('collectSecretKeys tolerates missing sections', () => {
    const onlyEnv = JSON.stringify({
        value: {
            environmentVariables: {
                value: { TOKEN: { value: 't', secret: true, trace: {} } },
                trace: {}
            }
        },
        trace: {}
    });
    assert.deepEqual([...collectSecretKeys(onlyEnv)], ['TOKEN']);

    // No environmentVariables or files at all -> empty set, no throw.
    assert.equal(collectSecretKeys(JSON.stringify({ value: {}, trace: {} })).size, 0);
    assert.equal(collectSecretKeys(JSON.stringify({})).size, 0);
});

test('collectSecretKeys detects a secret nested under an object value', () => {
    // Defensive: a non-scalar value whose secret marker sits on a child node.
    const nested = JSON.stringify({
        value: {
            environmentVariables: {
                value: {
                    CONFIG: {
                        value: {
                            password: { value: 'p', secret: true, trace: {} }
                        },
                        trace: {}
                    }
                },
                trace: {}
            }
        },
        trace: {}
    });
    assert.deepEqual([...collectSecretKeys(nested)], ['CONFIG']);
});

test('collectSecretKeys throws on non-JSON output', () => {
    assert.throws(
        () => collectSecretKeys('not json at all'),
        /Could not parse .* as JSON/
    );
});
