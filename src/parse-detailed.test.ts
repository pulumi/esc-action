import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { parseDetailedEnvironmentVariables } from './parse-detailed.js';

// Build a `--format detailed` document from a flat map of env var nodes. Each
// entry is { value, secret? } and gets wrapped in the { value, trace } shape
// the CLI emits.
function detailed(entries: Record<string, { value: unknown; secret?: boolean }>): string {
    const environmentVariables: Record<string, unknown> = {};
    for (const [k, e] of Object.entries(entries)) {
        environmentVariables[k] = { value: e.value, ...(e.secret ? { secret: true } : {}), trace: { def: {} } };
    }
    return JSON.stringify({
        value: {
            environmentVariables: { value: environmentVariables, trace: { def: {} } },
        },
        trace: { def: {} },
    });
}

test('extracts env vars and records only secret keys', () => {
    const { values, secrets } = parseDetailedEnvironmentVariables(
        detailed({
            API_KEY: { value: 'abc123', secret: true },
            REGION: { value: 'us-west-2' },
        }),
    );

    assert.deepEqual(values, { API_KEY: 'abc123', REGION: 'us-west-2' });
    assert.ok(secrets.has('API_KEY'), 'secret value must be marked');
    assert.ok(!secrets.has('REGION'), 'non-secret value must not be marked');
});

test('decodes a multi-line PEM-encoded value byte-for-byte', () => {
    const sshKey =
        '-----BEGIN OPENSSH PRIVATE KEY-----\n' +
        'b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAArAAAABNlY2RzYS\n' +
        '-----END OPENSSH PRIVATE KEY-----\n';

    const { values } = parseDetailedEnvironmentVariables(
        detailed({ PULUMI_BOT_SSH_KEY: { value: sshKey, secret: true } }),
    );

    assert.equal(values.PULUMI_BOT_SSH_KEY, sshKey);
    assert.ok(values.PULUMI_BOT_SSH_KEY.includes('\n'), 'newlines must be preserved');
});

test('includes projected file paths as ordinary string values', () => {
    const { values, secrets } = parseDetailedEnvironmentVariables(
        detailed({ MY_FILE: { value: '/tmp/esc-abc123' } }),
    );

    assert.equal(values.MY_FILE, '/tmp/esc-abc123');
    assert.ok(!secrets.has('MY_FILE'));
});

test('stringifies booleans and numbers like the CLI', () => {
    const { values } = parseDetailedEnvironmentVariables(
        detailed({ ENABLED: { value: true }, PORT: { value: 8080 }, RATIO: { value: 3.14 } }),
    );

    assert.equal(values.ENABLED, 'true');
    assert.equal(values.PORT, '8080');
    assert.equal(values.RATIO, '3.14');
});

test('skips nested objects and arrays, keeps scalars', () => {
    const { values } = parseDetailedEnvironmentVariables(
        detailed({
            SCALAR: { value: 'keep' },
            NESTED: { value: { a: { value: 1, trace: { def: {} } } } },
            LIST: { value: [{ value: 'x', trace: { def: {} } }] },
        }),
    );

    assert.deepEqual(values, { SCALAR: 'keep' });
});

test('treats a null value as the empty string', () => {
    const { values } = parseDetailedEnvironmentVariables(detailed({ EMPTY: { value: null } }));
    assert.equal(values.EMPTY, '');
});

test('returns empty result when there are no environment variables', () => {
    assert.deepEqual(parseDetailedEnvironmentVariables(JSON.stringify({ value: {}, trace: { def: {} } })), {
        values: {},
        secrets: new Set(),
    });
});
