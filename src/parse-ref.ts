// Parse the `environment` input into its parts.
//
// The accepted forms are:
//
//   <env>[@<version>]
//   <project>/<env>[@<version>]
//   <org>/<project>/<env>[@<version>]
//
// A 1-part name lives in the `default` project. The org of a 1-part or 2-part
// name is the caller's default org, which the caller resolves separately.
//
// Unlike the ESC CLI, a 2-part name is always <project>/<env>: the legacy
// <org>/<env> form is not accepted.
export interface EnvironmentRef {
    org?: string;
    project: string;
    env: string;
    version?: string;
}

export const DEFAULT_PROJECT = 'default';

export function parseEnvironmentRef(input: string): EnvironmentRef {
    const invalid = (why: string) =>
        new Error(
            `Invalid environment "${input}": ${why}. ` +
                'Expected [[<org>/]<project>/]<environment>[@<version>].',
        );

    const at = input.indexOf('@');
    const path = at === -1 ? input : input.slice(0, at);
    const version = at === -1 ? undefined : input.slice(at + 1);
    if (version !== undefined && (version === '' || version.includes('@'))) {
        throw invalid('the version after "@" must be a single non-empty value');
    }

    const parts = path.split('/');
    if (parts.length > 3) {
        throw invalid('too many "/"-separated parts');
    }
    if (parts.some(p => p === '')) {
        throw invalid('every "/"-separated part must be non-empty');
    }

    const [org, project, env] =
        parts.length === 3
            ? parts
            : parts.length === 2
              ? [undefined, parts[0], parts[1]]
              : [undefined, DEFAULT_PROJECT, parts[0]];
    return { org, project, env, version };
}
