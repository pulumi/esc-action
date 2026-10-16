import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import type { Value } from '@pulumi/esc-sdk';
import { parseScalars } from './parse-properties.js';

type Entries = Record<string, { value: unknown; secret?: boolean }>;

// Build environment properties with one top-level object property. Each entry
// is { value, secret? } and gets wrapped in the { value, trace } shape the API
// returns.
function properties(property: string, entries: Entries): Record<string, Value> {
    const nodes: Record<string, unknown> = {};
    for (const [k, e] of Object.entries(entries)) {
        nodes[k] = { value: e.value, ...(e.secret ? { secret: true } : {}), trace: {} };
    }
    return { [property]: { value: nodes, trace: {} } };
}

const envVars = (entries: Entries) => parseScalars(properties('environmentVariables', entries), 'environmentVariables');

test('extracts env vars and records only secret keys', () => {
    assert.deepEqual(
        envVars({
            API_KEY: { value: 'abc123', secret: true },
            REGION: { value: 'us-west-2' },
        }),
        { values: { API_KEY: 'abc123', REGION: 'us-west-2' }, secrets: new Set(['API_KEY']) },
    );
});

test('reads files independently of environmentVariables', () => {
    const props = {
        ...properties('environmentVariables', { A: { value: 'a' } }),
        ...properties('files', { KUBECONFIG: { value: 'apiVersion: v1\n', secret: true } }),
    };
    assert.deepEqual(parseScalars(props, 'files'), {
        values: { KUBECONFIG: 'apiVersion: v1\n' },
        secrets: new Set(['KUBECONFIG']),
    });
});

test('decodes a multi-line PEM-encoded value byte-for-byte', () => {
    const sshKey =
        '-----BEGIN OPENSSH PRIVATE KEY-----\n' +
        'b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAArAAAABNlY2RzYS\n' +
        '-----END OPENSSH PRIVATE KEY-----\n';

    assert.deepEqual(envVars({ PULUMI_BOT_SSH_KEY: { value: sshKey, secret: true } }).values, {
        PULUMI_BOT_SSH_KEY: sshKey,
    });
});

test('stringifies booleans and numbers like the CLI', () => {
    assert.deepEqual(envVars({ ENABLED: { value: true }, PORT: { value: 8080 }, RATIO: { value: 3.14 } }).values, {
        ENABLED: 'true',
        PORT: '8080',
        RATIO: '3.14',
    });
});

test('skips nested objects and arrays, keeps scalars', () => {
    const { values } = envVars({
        SCALAR: { value: 'keep' },
        NESTED: { value: { a: { value: 1, trace: {} } } },
        LIST: { value: [{ value: 'x', trace: {} }] },
    });

    assert.deepEqual(values, { SCALAR: 'keep' });
});

test('treats a null value as the empty string', () => {
    assert.deepEqual(envVars({ EMPTY: { value: null } }).values, { EMPTY: '' });
});

test('returns empty result when the property is missing', () => {
    const empty = { values: {}, secrets: new Set() };
    assert.deepEqual(parseScalars(undefined, 'environmentVariables'), empty);
    assert.deepEqual(parseScalars({}, 'files'), empty);
});
