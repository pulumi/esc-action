import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as io from '@actions/io';
import * as tc from '@actions/tool-cache';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as rt from 'runtypes';
import {
    type OidcLoginConfig,
    OidcLoginConfigRuntype,
    ensureAccessToken,
} from '@pulumi/actions-helpers/auth';

function getInput(name: string, envVar: string, required?: boolean): string | undefined {
    const val = core.getInput(name) || process.env[`ESC_ACTION_${envVar}`];
    if (!val && required) {
        throw new Error(`Input or environment variable required and not supplied: ${name} (${envVar})`);
    }
    core.info(`input ${name} or ESC_ACTION_${envVar}: ${val}`);
    return val;
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

function getBooleanInput(name: string, envVar: string, required?: boolean): boolean | undefined {
    const val = getInput(name, envVar, required);
    if (!val) {
        return undefined;
    }
    return parseBooleanValue(val);
}

function getNumberInput(name: string, envVar: string, required?: boolean): number | undefined {
    const val = getInput(name, envVar, required);
    if (!val) {
        return undefined;
    }
    const parsedVal = Number(val);
    if (Number.isNaN(parsedVal)) {
        throw new Error('Input was not a number');
    }
    return parsedVal || undefined;
}

function getOidcLoginConfig(cloudUrl: string): rt.Result<OidcLoginConfig> {
    return OidcLoginConfigRuntype.validate({
        organizationName: getInput('oidc-organization', 'OIDC_ORGANIZATION', true)!,
        requestedTokenType: getInput('oidc-requested-token-type', 'OIDC_REQUESTED_TOKEN_TYPE', true)!,
        scope: getInput('oidc-scope', 'OIDC_SCOPE') || undefined,
        expiration: getNumberInput('oidc-token-expiration', 'OIDC_TOKEN_EXPIRATION') || undefined,
        cloudUrl: cloudUrl || 'https://api.pulumi.com',
        exportEnvironmentVariables: false,
    });
}

function getExportEnvironmentVariables(keys: string | undefined): [Record<string, string>, boolean] {
    const exportAll = !keys;
    const keysMapping = keys ? Object.fromEntries(keys.split(',').map(k => [k, k])) : {};

    // If no value is present for keys, default to pulling mappings from keys.
    const input = getInput('export-environment-variables', 'EXPORT_ENVIRONMENT_VARIABLES');
    if (!input) {
        return [keysMapping, exportAll]
    }

    // If the value is a boolean true or false, return it with the mappings from keys.
    try {
        const exportAny = parseBooleanValue(input);
        return !exportAny ? [{}, false] : [keysMapping, exportAll];
    } catch { }

    // Otherwise, parse the value as a list of [FOO=]BAR key-value pairs, where FOO is the name of the envvar to set and
    // BAR is the name of the variable to use as the value. If FOO is omitted, BAR is also used as the name of the
    // envvar to set. If BAR is '*', then all unmapped variables are implicitly mapped to themselves.
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

    let all = false;
    const mappings: Record<string, string> = {};
    for (const mapping of input.split(',').map(v => v.trim())) {
        if (mapping === '*') {
            all = true;
            continue;
        }

        const eq = mapping.indexOf('=');
        if (eq === -1) {
            mappings[mapping] = mapping;
        } else {
            const [to, from] = [mapping.slice(0, eq), mapping.slice(eq + 1)];
            mappings[to] = from;
        }
    }
    return [mappings, all];
}

async function getInstalledVersion(): Promise<string | undefined> {
    const installed = await io.which('esc');
    if (!installed) {
        return undefined;
    }

    // Return version without 'v' prefix
    const { exitCode, stdout } = await exec.getExecOutput('esc', ['version']);
    if (exitCode === 0 && stdout.trim().startsWith('v')) {
        return stdout.trim().substring(1);
    }

    return undefined;
}

async function install(version: string): Promise<void> {
    const installedVersion = await getInstalledVersion();
    if (installedVersion === version) {
        core.info('ESC CLI is already installed, skipping installation step.');
        return;
    }

    core.startGroup(`Installing ESC CLI v${version}`);
    if (installedVersion) {
        core.info(`Already-installed ESC CLI is not version ${version}`);
    }

    const tmp = fs.mkdtempSync('esc-');

    const destination = path.join(os.homedir(), '.pulumi', 'esc', 'bin');
    core.info(`Install destination is ${destination}`);

    await io.mkdirP(destination);
    core.debug(`Successfully created ${destination}`);

    const [platform, arch, ext] = core.platform.platform === 'win32' ? ['windows', 'x64', 'zip'] : [core.platform.platform, core.platform.arch, 'tar.gz'];
    const downloadURL = `https://get.pulumi.com/esc/releases/esc-v${version}-${platform}-${arch}.${ext}`;
    core.info(`downloading ${downloadURL}`);
    const downloaded = await tc.downloadTool(downloadURL);
    core.info(`successfully downloaded ${downloadURL} to ${downloaded}`);

    const [extract, bin, srcDir] = platform === 'windows' ? [tc.extractZip, 'esc.exe', 'bin'] : [tc.extractTar, 'esc', ''];
    const extractedPath = await extract(downloaded, tmp);
    core.info(`Successfully extracted ${downloaded} to ${extractedPath}`);
    const oldPath = path.join(tmp, 'esc', srcDir, bin);
    const newPath = path.join(destination, bin);
    await io.cp(oldPath, newPath);
    await io.rmRF(oldPath);
    core.info(`Successfully moved ${oldPath} to ${newPath}`);

    const cachedPath = await tc.cacheDir(destination, 'esc', version);
    core.addPath(cachedPath);

    core.endGroup();
}

async function run(): Promise<void> {
    try {
        // Parse inputs
        const escVersion: string = getInput('version', 'VERSION') || await fetch('https://www.pulumi.com/esc/latest-version').then(r => r.text()).then(t => t.trim());
        const environment = getInput('environment', 'ENVIRONMENT');
        const keys = getInput('keys', 'KEYS');
        const cloudUrl = getInput('cloud-url', 'CLOUD_URL') || 'https://api.pulumi.com';
        const [mapping, allVars] = getExportEnvironmentVariables(keys);

        const useOidcAuth = getBooleanInput('oidc-auth', 'OIDC_AUTH');
        if (useOidcAuth) {
            const oidcConfig = getOidcLoginConfig(cloudUrl);
            if (!oidcConfig.success) {
                throw new Error('Invalid OIDC configuration');
            }
            const accessToken = await ensureAccessToken(oidcConfig.value);
            core.setSecret(accessToken);
            process.env.PULUMI_ACCESS_TOKEN = accessToken;
        }

        /*
          Install ESC CLI (either the latest or a specific version)

          The official installation script supports an optional `--version` argument to pin a release.
          e.g. curl -fsSL https://get.pulumi.com/esc/install.sh | sh -s -- --version 0.10.0

          If no version is specified, it installs the latest automatically.
        */
        await install(escVersion);

        if (cloudUrl) {
            // Set the ESC_CLOUD_URL environment variable if provided
            core.info(`Setting PULUMI_BACKEND_URL to ${cloudUrl}`);
            process.env.PULUMI_BACKEND_URL = cloudUrl;
        }

        // Inject environment variables if requested
        //
        // Check if an environment was provided. If not, skip injection.
        if (environment) {
            // Open the environment. The dotenv format is used because it includes
            // environment variables as well as files.
            core.startGroup(`Opening ESC environment: ${environment}`);
            const result = await exec.getExecOutput(
                'esc',
                ['open', environment, '--format', 'dotenv'],
                { silent: true, ignoreReturnCode: true }
            );

            if (result.exitCode !== 0) {
                throw new Error(`\`esc open\` command failed:
${result.stderr}`)
            }

            // Parse the output
            let dotenv: Record<string, string> = {};
            try {
                // The output is in the format KEY="VALUE"
                // We need to convert it to an object
                const lines = result.stdout.split('\n');
                for (const line of lines) {
                    const eq = line.indexOf('=');
                    if (eq < 0) {
                        continue;
                    }
                    const [key, value] = [line.slice(0, eq), line.slice(eq + 1)];

                    if (key && value) {
                        // Remove quotes from the value
                        dotenv[key.trim()] = value.replace(/(^"|"$)/g, '');
                    }
                }
            } catch (parseErr) {
                throw new Error(`Failed to open environment: ${parseErr}`);
            }

            // Populate step outputs and mark secrets so they do not appear in logs.
            for (const [key, value] of Object.entries(dotenv)) {
                core.setSecret(value);
                core.setOutput(key, value);
            }

            // Calculate the final set of mappings. If allVars is true, add identity mappings for all unmapped variables;
            // otherwise, just use the user's mappings.
			if (allVars) {
				const mapped = new Set(Object.values(mapping));
				for (const k of Object.keys(dotenv).filter(k => !mapped.has(k))) {
					mapping[k] = k;
				}
			}

            // Export envvars.
            if (Object.keys(mapping).length != 0) {
                const envFilePath = process.env.GITHUB_ENV;
                if (!envFilePath) {
                    throw new Error('GITHUB_ENV is not defined. Cannot append environment variables.');
                }

                for (const [to, from] of Object.entries(mapping)) {
                    const value = dotenv[from];
                    if (value) {
                        // Append in multiline syntax to handle any newlines safely
                        // e.g.: MY_ENV_VAR<<EOF
                        // line1
                        // line2
                        // EOF
                        fs.appendFileSync(envFilePath, `${to}<<PULUMIESCEOF\n${value}\nPULUMIESCEOF\n`);
                        core.info(`Injected ${to}=${from}`);
                    } else {
                        core.warning(`No value found for ${to}=environmentVariables.${from}`);
                    }
                }
                core.info(`Injected ${Object.keys(mapping).length} environment variables`);
            }

            core.endGroup();
        }
    } catch (error) {
        if (error instanceof Error) {
            core.setFailed(error.message);
        } else {
            core.setFailed(String(error));
        }
    }
}

run();
