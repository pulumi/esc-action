// Parse the output of `pulumi esc open --format dotenv`.
//
// The CLI emits one entry per line as `KEY="VALUE"`, where VALUE is the
// Go strconv.Quote encoding of the original string. That encoding uses
// backslash-escape sequences (`\n`, `\r`, `\t`, `\\`, `\"`, and
// `\uXXXX` for Unicode) and is a strict subset of JSON string syntax
// for printable strings. JSON.parse handles those escapes correctly,
// so a multi-line value such as a PEM-encoded key round-trips with its
// newlines intact rather than arriving as literal `\n` pairs.
//
// Lines that do not contain `=`, or that have an empty key or value,
// are skipped (this also covers blank lines and `# comment` lines).
//
// If a line's value isn't a valid JSON string -- e.g. a future
// strconv.Quote escape that JSON.parse can't represent (`\a`, `\v`,
// `\xNN`) -- we fall back to bare strip-quote behavior so the parser
// stays robust.
export function parseDotenv(stdout: string): Record<string, string> {
    const dotenv: Record<string, string> = {};
    const lines = stdout.split('\n');
    for (const line of lines) {
        const eq = line.indexOf('=');
        if (eq < 0) {
            continue;
        }
        const key = line.slice(0, eq).trim();
        const quoted = line.slice(eq + 1);
        if (!key || !quoted) {
            continue;
        }
        let value: unknown;
        try {
            value = JSON.parse(quoted);
        } catch {
            value = quoted.replace(/(^"|"$)/g, '');
        }
        if (typeof value === 'string') {
            dotenv[key] = value;
        }
    }
    return dotenv;
}
