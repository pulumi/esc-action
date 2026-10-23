import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { parseEnvironmentRef } from './parse-ref.js';

test('parses each accepted form', () => {
    const cases: [string, ReturnType<typeof parseEnvironmentRef>][] = [
        ['env', { org: undefined, project: 'default', env: 'env', version: undefined }],
        ['proj/env', { org: undefined, project: 'proj', env: 'env', version: undefined }],
        ['org/proj/env', { org: 'org', project: 'proj', env: 'env', version: undefined }],
        ['env@3', { org: undefined, project: 'default', env: 'env', version: '3' }],
        ['proj/env@stable', { org: undefined, project: 'proj', env: 'env', version: 'stable' }],
        ['org/proj/env@latest', { org: 'org', project: 'proj', env: 'env', version: 'latest' }],
    ];
    for (const [input, expected] of cases) {
        assert.deepEqual(parseEnvironmentRef(input), expected, input);
    }
});

test('rejects malformed names', () => {
    for (const input of ['', 'a/b/c/d', '/env', 'proj/', 'org//env', 'env@', 'env@1@2', '@1']) {
        assert.throws(() => parseEnvironmentRef(input), /^Error: Invalid environment/, input);
    }
});
