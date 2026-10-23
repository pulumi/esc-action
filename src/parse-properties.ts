import type { Value } from '@pulumi/esc-sdk';

// Extract the scalar entries of a top-level object property of an opened
// environment, and which of them are secret. The action reads two properties
// this way: `environmentVariables` (values to export) and `files` (contents of
// files to write, keyed by the variable that holds each file's path).
//
// Each entry of the property is a node of the form `{ value, secret?, trace }`.
//
//   - Only scalar values (string, number, boolean, null) are kept; nested
//     objects and arrays are skipped.
//   - Numbers and booleans are stringified the same way the CLI's ToString
//     does (`true`/`false`, and the number's textual form). A null value
//     becomes the empty string.
//
// A node with `secret: true` is recorded in the returned set so the caller can
// mask only those values, leaving non-secret values readable in logs.
export interface Scalars {
    values: Record<string, string>;
    secrets: Set<string>;
}

export function parseScalars(
    properties: Record<string, Value> | undefined,
    property: 'environmentVariables' | 'files',
): Scalars {
    const values: Record<string, string> = {};
    const secrets = new Set<string>();

    const entries = properties?.[property]?.value;
    if (!entries || typeof entries !== 'object') {
        return { values, secrets };
    }

    for (const [key, node] of Object.entries<Value>(entries)) {
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
