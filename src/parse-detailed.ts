// Parse the output of `pulumi env open --format detailed` and extract the
// environment variables, along with which of them are secret.
//
// The detailed format is a structured JSON tree. The environment variables
// live at `.value.environmentVariables.value`, where each entry is a node of
// the form `{ value, secret?, trace }`.
//
//   - Only scalar values (string, number, boolean, null) become environment
//     variables; nested objects and arrays are skipped.
//   - Numbers and booleans are stringified the same way the CLI's ToString
//     does (`true`/`false`, and the number's textual form). A null value
//     becomes the empty string.
//   - Files are already projected into environmentVariables (each file's key
//     holds the path to its materialized temporary file), so no separate
//     handling is required -- they arrive here as ordinary string values.
//
// A node with `secret: true` is recorded in the returned set so the caller can
// mask only those values, leaving non-secret values readable in logs.
export interface DetailedEnvironment {
    values: Record<string, string>;
    secrets: Set<string>;
}

export function parseDetailedEnvironmentVariables(stdout: string): DetailedEnvironment {
    const values: Record<string, string> = {};
    const secrets = new Set<string>();

    const parsed = JSON.parse(stdout);
    const envVars = parsed?.value?.environmentVariables?.value;
    if (!envVars || typeof envVars !== 'object') {
        return { values, secrets };
    }

    for (const [key, node] of Object.entries<any>(envVars)) {
        const v = node?.value;

        let str: string;
        if (typeof v === 'string') {
            str = v;
        } else if (typeof v === 'number' || typeof v === 'boolean') {
            str = String(v);
        } else if (v === null || v === undefined) {
            str = '';
        } else {
            // Objects and arrays are not environment variables.
            continue;
        }

        values[key] = str;
        if (node?.secret === true) {
            secrets.add(key);
        }
    }

    return { values, secrets };
}
