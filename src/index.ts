import * as core from '@actions/core';
import { Configuration, EscRawApi, type Value } from '@pulumi/esc-sdk';
import axios, { type AxiosInstance, isAxiosError } from 'axios';
import * as axiosRetryModule from 'axios-retry';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseScalars } from './parse-properties.js';
import { parseEnvironmentRef, type EnvironmentRef } from './parse-ref.js';
import { parseExportMappings } from './parse-mapping.js';

// axios-retry v4 exports as CJS, need to access default export
const axiosRetry = (axiosRetryModule as any).default || axiosRetryModule;
const { exponentialDelay, isNetworkError } = axiosRetryModule;

const DEFAULT_CLOUD_URL = 'https://api.pulumi.com';

function getInput(name: string, envVar: string): string | undefined {
    const val = core.getInput(name) || process.env[envVar];
    return val || undefined;
}

function parseBooleanValue(val: string): boolean {
    const trueValue = ['true', 'True', 'TRUE'];
    const falseValue = ['false', 'False', 'FALSE'];
    if (trueValue.includes(val)) {
        return true;
    }
    if (falseValue.includes(val)) {
        return false;
    }

    throw new TypeError(`Value does not meet YAML 1.2 "Core Schema" specification\n` +
        `Support boolean input list: \`true | True | TRUE | false | False | FALSE\``);
}

function parseCloudUrl(input: string | undefined): string {
    const raw = input || DEFAULT_CLOUD_URL;
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        throw new Error(`Invalid cloud-url "${raw}": not an absolute URL`);
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new Error(`Invalid cloud-url "${raw}": the scheme must be http or https`);
    }
    return url.toString().replace(/\/+$/, '');
}

// Returns the requested mapping of exported envvar name to ESC envvar name, and
// whether unmapped ESC envvars are also exported under their own name.
function getExportEnvironmentVariables(): [Record<string, string>, boolean] {
    const input = getInput('export-environment-variables', 'ESC_ACTION_EXPORT_ENVIRONMENT_VARIABLES');
    if (!input) {
        return [{}, true];
    }

    // If the value is a boolean, export all or nothing.
    try {
        return [{}, parseBooleanValue(input)];
    } catch { }

    // Otherwise, parse the value as a list of [FOO=]BAR key-value pairs, where FOO is the name of the envvar to set and
    // BAR is the name of the variable to use as the value. If FOO is omitted, BAR is also used as the name of the
    // envvar to set. If BAR is '*', then all unmapped variables are implicitly mapped to themselves.
    //
    // Entries may be separated by commas, newlines, or both -- this allows the input to be provided either as a
    // single-line comma-separated list or as a YAML block scalar with one entry per line (or any mix thereof).
    //
    // For example, the value 'GITHUB_TOKEN=PULUMI_BOT_TOKEN,AWS_KEY_ID,AWS_SECRET_KEY,AWS_SESSION_TOKEN' will export
    // this environment:
    //
    //   GITHUB_TOKEN=PULUMI_BOT_TOKEN
    //   AWS_KEY_ID=AWS_KEY_ID
    //   AWS_SECRET_KEY=AWS_SECRET_KEY
    //   AWS_SESSION_TOKEN=AWS_SESSION_TOKEN
    //
    // If the source ESC env also contained other environment variables, they would not be exported. All non-mapped variables
    // can be exported with the identity mapping by including '*' as a key. For example, 'GITHUB_TOKEN=PULUMI_BOT_TOKEN,*`
    // would also export the environment above assuming no other envvars exist in the ESC environment.
    return parseExportMappings(input);
}

// Create an HTTP client that retries transient failures. The POST that opens an environment is retried too: a
// duplicate open only leaves an extra session that expires on its own.
function newHttpClient(): AxiosInstance {
    const http = axios.create();
    axiosRetry(http, {
        retries: 5,
        retryDelay: exponentialDelay,
        retryCondition: (error: any) => {
            const status = error.response?.status;
            return isNetworkError(error) || status === 429 || (status !== undefined && status >= 500);
        },
        onRetry: (retryCount: number, error: any, requestConfig: any) => {
            core.info(`Retrying ${requestConfig.method?.toUpperCase()} ${requestConfig.url} (attempt ${retryCount}/5): ${error.message}`);
        },
    });
    return http;
}

function describeError(error: unknown): string {
    if (!isAxiosError(error)) {
        return error instanceof Error ? error.message : String(error);
    }
    const request = `${error.config?.method?.toUpperCase()} ${error.config?.url}`;
    if (!error.response) {
        return `${request} failed: ${error.message}`;
    }
    const data = error.response.data;
    const detail = typeof data?.message === 'string' ? data.message : JSON.stringify(data);
    return `${request} failed with status ${error.response.status}: ${detail}`;
}

// Resolve the org the same way the Pulumi CLI does, minus the CLI's local config file:
// PULUMI_DEFAULT_ORGANIZATION, then the org that Pulumi Cloud picks as the default, then the user's own org.
async function resolveDefaultOrg(http: AxiosInstance, cloudUrl: string, accessToken: string): Promise<string> {
    const fromEnv = process.env.PULUMI_DEFAULT_ORGANIZATION;
    if (fromEnv) {
        return fromEnv;
    }

    const headers = { Authorization: `token ${accessToken}` };
    try {
        const { data } = await http.get(`${cloudUrl}/api/user/organizations/default`, { headers });
        if (data?.gitHubLogin) {
            return data.gitHubLogin;
        }
    } catch (error) {
        // A backend without the endpoint leaves the choice to the client.
        if (!isAxiosError(error) || error.response?.status !== 404) {
            throw error;
        }
    }

    const { data } = await http.get(`${cloudUrl}/api/user`, { headers });
    if (!data?.githubLogin) {
        throw new Error(`GET ${cloudUrl}/api/user returned no user name`);
    }
    return data.githubLogin;
}

async function openEnvironment(
    http: AxiosInstance,
    cloudUrl: string,
    accessToken: string,
    ref: EnvironmentRef & { org: string },
): Promise<Record<string, Value> | undefined> {
    // The SDK is a CommonJS package, so it sees axios's CommonJS type declarations while this ES module sees the ESM
    // ones. Both describe the same runtime object, but TypeScript treats them as unrelated types.
    const sdkHttp = http as unknown as ConstructorParameters<typeof EscRawApi>[2];
    const api = new EscRawApi(new Configuration({ accessToken, basePath: `${cloudUrl}/api/esc` }), undefined, sdkHttp);

    const { org, project, env, version } = ref;
    const { data: open } = version
        ? await api.openEnvironmentAtVersion(org, project, env, version)
        : await api.openEnvironment(org, project, env);
    if (!open.id) {
        throw new Error(`Opening the environment returned no session: ${JSON.stringify(open.diagnostics ?? open)}`);
    }

    const { data } = await api.readOpenEnvironment(org, project, env, open.id);
    return data.properties;
}

// Write each file to a new temporary file that only the current user can read, and return the path for each key.
function writeTemporaryFiles(files: Record<string, string>): Record<string, string> {
    const dir = process.env.RUNNER_TEMP || os.tmpdir();
    const paths: Record<string, string> = {};
    for (const [key, content] of Object.entries(files)) {
        const file = path.join(dir, `esc-${randomBytes(8).toString('hex')}`);
        fs.writeFileSync(file, content, { flag: 'wx', mode: 0o600 });
        paths[key] = file;
    }
    return paths;
}

async function run(): Promise<void> {
    try {
        const environment = getInput('environment', 'ESC_ACTION_ENVIRONMENT');
        if (!environment) {
            throw new Error('Input or environment variable required and not supplied: environment (ESC_ACTION_ENVIRONMENT)');
        }
        const ref = parseEnvironmentRef(environment);
        const cloudUrl = parseCloudUrl(getInput('cloud-url', 'ESC_ACTION_CLOUD_URL'));
        const [mapping, allVars] = getExportEnvironmentVariables();

        const accessToken = getInput('pulumi-access-token', 'PULUMI_ACCESS_TOKEN');
        if (!accessToken) {
            throw new Error('A Pulumi access token is required: set the pulumi-access-token input or PULUMI_ACCESS_TOKEN');
        }
        core.setSecret(accessToken);

        const http = newHttpClient();
        const org = ref.org ?? (await resolveDefaultOrg(http, cloudUrl, accessToken));

        core.startGroup(`Opening ESC environment: ${org}/${ref.project}/${ref.env}${ref.version ? `@${ref.version}` : ''}`);
        const properties = await openEnvironment(http, cloudUrl, accessToken, { ...ref, org });

        const { values, secrets } = parseScalars(properties, 'environmentVariables');
        const files = parseScalars(properties, 'files');
        for (const key of files.secrets) {
            core.setSecret(files.values[key]);
        }
        // Like the Pulumi CLI, a file replaces an environment variable of the same name. The path is not secret.
        for (const [key, file] of Object.entries(writeTemporaryFiles(files.values))) {
            values[key] = file;
            secrets.delete(key);
        }

        // Populate step outputs, masking only secret values so they do not
        // appear in logs while non-secret values remain readable.
        for (const [key, value] of Object.entries(values)) {
            if (secrets.has(key)) {
                core.setSecret(value);
            }
            core.setOutput(key, value);
        }

        // Calculate the final set of mappings. If allVars is true, add identity mappings for all unmapped variables;
        // otherwise, just use the user's mappings.
        if (allVars) {
            const mapped = new Set(Object.values(mapping));
            for (const k of Object.keys(values).filter(k => !mapped.has(k))) {
                mapping[k] = k;
            }
        }

        for (const [to, from] of Object.entries(mapping)) {
            if (!(from in values)) {
                core.warning(`No value found for ${to}=environmentVariables.${from}`);
                continue;
            }
            core.exportVariable(to, values[from]);
            core.info(`Injected ${to}=${from}`);
        }
        core.endGroup();
    } catch (error) {
        core.setFailed(describeError(error));
    }
}

run();
