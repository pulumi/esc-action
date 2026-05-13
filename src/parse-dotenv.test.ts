import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { parseDotenv } from './parse-dotenv.js';

// Mirror Go's strconv.Quote for the escapes JSON.parse and the CLI
// agree on: `\n`, `\r`, `\t`, `\\`, `\"`. This is what the CLI
// emits for any printable text we care about; a real round-trip
// against the live CLI is covered by the integration test workflow.
function goQuote(s: string): string {
    return '"' + s
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t') + '"';
}

test('decodes a multi-line PEM-encoded value byte-for-byte', () => {
    const sshKey =
        '-----BEGIN OPENSSH PRIVATE KEY-----\n' +
        'b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAArAAAABNlY2RzYS\n' +
        '1zaGEyLW5pc3RwNTIxAAAACG5pc3RwNTIxAAAAhQQ\n' +
        '-----END OPENSSH PRIVATE KEY-----\n';

    const stdout = `PULUMI_BOT_SSH_KEY=${goQuote(sshKey)}\n`;

    const parsed = parseDotenv(stdout);

    assert.equal(parsed.PULUMI_BOT_SSH_KEY, sshKey);
    assert.ok(parsed.PULUMI_BOT_SSH_KEY.includes('\n'),
        'value must contain actual newlines, not literal \\n pairs');
    assert.ok(!parsed.PULUMI_BOT_SSH_KEY.includes('\\n'),
        'value must not contain literal \\n pairs');
});

test('parses a simple single-line value', () => {
    const parsed = parseDotenv(`API_KEY="abc123"\n`);
    assert.equal(parsed.API_KEY, 'abc123');
});

test('parses values containing = (regression for #29 / #30)', () => {
    const parsed = parseDotenv(`AUTH_HEADER="Bearer eyJhbGc=.signature"\n`);
    assert.equal(parsed.AUTH_HEADER, 'Bearer eyJhbGc=.signature');
});

test('skips blank lines, comments, and lines without =', () => {
    const stdout = [
        '',
        '# a comment',
        'A="x"',
        '   ',
        'malformed-line-without-equals',
        'B="y"',
        '',
    ].join('\n');

    const parsed = parseDotenv(stdout);

    assert.deepEqual(parsed, { A: 'x', B: 'y' });
});

test('decodes embedded escaped quotes', () => {
    const original = 'he said "hi"';
    const parsed = parseDotenv(`MSG=${goQuote(original)}\n`);
    assert.equal(parsed.MSG, original);
});

test('decodes \\t and \\r escapes', () => {
    const original = 'a\tb\rc';
    const parsed = parseDotenv(`X=${goQuote(original)}\n`);
    assert.equal(parsed.X, original);
});

test('decodes embedded literal backslashes', () => {
    const original = 'C:\\Users\\bot';
    const parsed = parseDotenv(`WINPATH=${goQuote(original)}\n`);
    assert.equal(parsed.WINPATH, original);
});

test('preserves file paths emitted for `files` entries', () => {
    // The CLI materializes `files` entries to temp files and emits
    // `KEY="<path>"`. The path itself contains no escapes, so this
    // should pass through verbatim.
    const parsed = parseDotenv(`MY_FILE="/tmp/esc-abc123"\n`);
    assert.equal(parsed.MY_FILE, '/tmp/esc-abc123');
});

test('parses multiple keys in a single output', () => {
    const stdout = [
        `A="1"`,
        `B="hello"`,
        `C=${goQuote('multi\nline')}`,
        `D="end"`,
    ].join('\n');

    const parsed = parseDotenv(stdout);

    assert.deepEqual(parsed, {
        A: '1',
        B: 'hello',
        C: 'multi\nline',
        D: 'end',
    });
});

test('falls back gracefully on unparseable values', () => {
    // \xNN is valid Go strconv.Quote output but invalid JSON. The
    // fallback strips the surrounding quotes and stores the literal
    // bytes. The action only ever stores text-shaped secrets, so this
    // path should not trigger in practice -- it's defensive.
    const parsed = parseDotenv(`X="hello\\x41"\n`);
    assert.equal(parsed.X, 'hello\\x41');
});

test('skips entries whose value is empty after the = sign', () => {
    const parsed = parseDotenv(`EMPTY=\nGOOD="ok"\n`);
    assert.deepEqual(parsed, { GOOD: 'ok' });
});

test('treats whitespace-only key as missing', () => {
    const parsed = parseDotenv(`   ="x"\nA="y"\n`);
    assert.deepEqual(parsed, { A: 'y' });
});

test('decodes \\uXXXX escapes for non-ASCII characters', () => {
    // strconv.Quote reaches for \uXXXX on non-ASCII code points.
    const parsed = parseDotenv(`GREETING="caf\\u00e9"\n`);
    assert.equal(parsed.GREETING, 'café');
});

test('decodes multi-line value with = signs inside the body', () => {
    // Base64-padded multi-line values exercise both the multi-line
    // round-trip and the indexOf('=') key/value split.
    const original = 'line1eqs=\nline2eqs==\n';
    const parsed = parseDotenv(`CERT=${goQuote(original)}\n`);
    assert.equal(parsed.CERT, original);
});

test('tolerates CRLF line endings (Windows runners)', () => {
    // The CLI emits CRLF on Windows. Splitting on \n only would leave
    // a trailing \r inside the quoted value; JSON.parse would then
    // reject the line and the fallback would store a CR-suffixed
    // string. Splitting on \r?\n avoids both.
    const parsed = parseDotenv(`A="x"\r\nB="y"\r\n`);
    assert.deepEqual(parsed, { A: 'x', B: 'y' });
});
