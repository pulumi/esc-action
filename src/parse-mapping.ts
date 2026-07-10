// Parse the `keys` and `export-environment-variables` action inputs.
//
// Both inputs accept a list of entries. Historically entries could only be
// separated by commas (`FOO,BAR,BAZ`), but GitHub Actions YAML also commonly
// supplies list-like values as a block scalar, one entry per line:
//
//   export-environment-variables: |
//     JIRA_API_TOKEN
//     JIRA_CLOUD_ID
//     JIRA_WORKSPACE_ID
//
// If entries are only split on `,`, a newline-separated block collapses into
// a single bogus entry containing embedded newlines (since there's no comma
// to split on), which then fails to match any real key in the opened
// environment. To support both styles -- and any mix of the two -- entries
// are split on commas and/or newlines, with surrounding whitespace trimmed
// and empty entries discarded.
const SEPARATOR = /[,\n]/;

function splitEntries(input: string): string[] {
    return input
        .split(SEPARATOR)
        .map(entry => entry.trim())
        .filter(entry => entry.length > 0);
}

// Parses the deprecated `keys` input: a list of key names to inject as-is.
export function parseKeysList(keys: string): string[] {
    return splitEntries(keys);
}

// Parses the `export-environment-variables` input (once it's been
// determined not to be a boolean) into a mapping of destination envvar name
// to source ESC environment variable name, plus whether unmapped variables
// should also be exported (triggered by a bare `*` entry).
//
// Each entry takes one of the following three forms:
//
// 1. `FOO=BAR`, which maps the ESC secret named `BAR` to the environment
//    variable `FOO`
// 2. `BAR`, which maps the ESC secret named `BAR` to the environment
//    variable `BAR` (equivalent to `BAR=BAR`)
// 3. `*`, which adds identity mappings for any unmapped secrets
export function parseExportMappings(input: string): [Record<string, string>, boolean] {
    let all = false;
    const mappings: Record<string, string> = {};
    for (const entry of splitEntries(input)) {
        if (entry === '*') {
            all = true;
            continue;
        }

        const eq = entry.indexOf('=');
        if (eq === -1) {
            mappings[entry] = entry;
        } else {
            const [to, from] = [entry.slice(0, eq), entry.slice(eq + 1)];
            mappings[to] = from;
        }
    }
    return [mappings, all];
}
