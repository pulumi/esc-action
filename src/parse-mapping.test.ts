import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { parseKeysList, parseExportMappings } from './parse-mapping.js';

test('parseKeysList splits a comma-separated list', () => {
    assert.deepEqual(parseKeysList('A,B,C'), ['A', 'B', 'C']);
});

test('parseKeysList splits a newline-separated list (YAML block scalar)', () => {
    // This mirrors the customer-reported bug: `export-environment-variables`
    // (and, historically, `keys`) supplied as a YAML block scalar joins
    // entries with `\n` rather than `,`.
    assert.deepEqual(parseKeysList('A\nB\nC'), ['A', 'B', 'C']);
});

test('parseKeysList trims whitespace and drops empty entries', () => {
    assert.deepEqual(parseKeysList(' A \n\n B ,C\n'), ['A', 'B', 'C']);
});

test('parseExportMappings supports comma-separated identity and renamed entries', () => {
    const [mappings, all] = parseExportMappings('GITHUB_TOKEN=PULUMI_BOT_TOKEN,AWS_KEY_ID,AWS_SECRET_KEY');
    assert.deepEqual(mappings, {
        GITHUB_TOKEN: 'PULUMI_BOT_TOKEN',
        AWS_KEY_ID: 'AWS_KEY_ID',
        AWS_SECRET_KEY: 'AWS_SECRET_KEY',
    });
    assert.equal(all, false);
});

test('parseExportMappings supports newline-separated entries (regression for reported bug)', () => {
    // Reported case: a YAML block scalar like
    //
    //   export-environment-variables: |
    //     JIRA_API_TOKEN
    //     JIRA_CLOUD_ID
    //     JIRA_WORKSPACE_ID
    //     SCRIPT_DIRECTORY_PATH
    //
    // must produce four independent identity mappings, not a single bogus
    // entry containing embedded newlines.
    const input = 'JIRA_API_TOKEN\nJIRA_CLOUD_ID\nJIRA_WORKSPACE_ID\nSCRIPT_DIRECTORY_PATH';
    const [mappings, all] = parseExportMappings(input);
    assert.deepEqual(mappings, {
        JIRA_API_TOKEN: 'JIRA_API_TOKEN',
        JIRA_CLOUD_ID: 'JIRA_CLOUD_ID',
        JIRA_WORKSPACE_ID: 'JIRA_WORKSPACE_ID',
        SCRIPT_DIRECTORY_PATH: 'SCRIPT_DIRECTORY_PATH',
    });
    assert.equal(all, false);
});

test('parseExportMappings supports a mix of commas and newlines', () => {
    const input = 'FOO=BAR,\nBAZ\nQUX=QUUX,\n*';
    const [mappings, all] = parseExportMappings(input);
    assert.deepEqual(mappings, {
        FOO: 'BAR',
        BAZ: 'BAZ',
        QUX: 'QUUX',
    });
    assert.equal(all, true);
});

test('parseExportMappings trims whitespace around entries and trailing newlines', () => {
    const input = '  FOO=BAR  \n  BAZ  \n';
    const [mappings] = parseExportMappings(input);
    assert.deepEqual(mappings, { FOO: 'BAR', BAZ: 'BAZ' });
});

test('parseExportMappings treats a bare * as a wildcard, not a mapping', () => {
    const [mappings, all] = parseExportMappings('*');
    assert.deepEqual(mappings, {});
    assert.equal(all, true);
});
