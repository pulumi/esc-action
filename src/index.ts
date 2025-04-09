import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as io from '@actions/io';
import * as tc from '@actions/tool-cache';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

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

    const tmp = fs.mkdtempSync("esc-");

    const destination = path.join(os.homedir(), '.pulumi', 'bin');
    core.info(`Install destination is ${destination}`);

    await io.mkdirP(destination);
    core.debug(`Successfully created ${destination}`);

    const [platform, arch, ext] = core.platform.platform === "win32" ? ["windows", "x64", "zip"] : [core.platform.platform, core.platform.arch, "tar.gz"];
    const downloadURL = `https://get.pulumi.com/esc/releases/esc-v${version}-${platform}-${arch}.${ext}`;
    core.info(`downloading ${downloadURL}`);
    const downloaded = await tc.downloadTool(downloadURL);
    core.info(`successfully downloaded ${downloadURL} to ${downloaded}`);

    const [extract, bin, srcDir] = platform === "windows" ? [tc.extractZip, 'esc.exe', 'bin'] : [tc.extractTar, 'esc', ''];
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
        const escVersion: string = core.getInput('version') || await fetch("https://www.pulumi.com/esc/latest-version").then(r => r.text()).then(t => t.trim());
        const environment: string = core.getInput('environment');
        const keys: string = core.getInput('keys');
        const cloudUrl: string = core.getInput('cloud-url');

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
            // Open the environment.
            core.startGroup(`Injecting environment variables from ESC environment: ${environment}`);
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
            let envObj: Record<string, string> = {};
            try {
                // The output is in the format KEY="VALUE"
                // We need to convert it to an object
                const lines = result.stdout.split('\n');
                for (const line of lines) {
                    const [key, value] = line.split('=');
                    if (key && value) {
                        // Remove quotes from the value
                        envObj[key.trim()] = value.replace(/(^"|"$)/g, '').trim();
                    }
                }
            } catch (parseErr) {
                throw new Error(`Failed to open environment: ${parseErr}`);
            }

            const envFilePath = process.env.GITHUB_ENV;
            if (!envFilePath) {
                throw new Error('GITHUB_ENV is not defined. Cannot append environment variables.');
            }

            // If user wants to inject specific variables:
            if (keys) {
                const variables = keys.split(',').map(v => v.trim());
                for (const variable of variables) {
                    const value = envObj[variable];

                    if (value) {
                        core.setSecret(value);
                        fs.appendFileSync(envFilePath, `${variable}<<EOF\n${value}\nEOF\n`);
                        core.info(`Injected ${variable}`);
                    } else {
                        core.warning(`No value found for environmentVariables.${variable}`);
                    }
                }
            } else {
                // If no specific keys are provided, inject all environment variables
                // For each key/value, mask and write multiline-friendly format
                for (const [key, value] of Object.entries(envObj)) {
                    // Mask the secret so it doesn't appear in logs
                    core.setSecret(value);

                    // Append in multiline syntax to handle any newlines safely
                    // e.g.: MY_ENV_VAR<<EOF
                    // line1
                    // line2
                    // EOF
                    fs.appendFileSync(envFilePath, `${key}<<EOF\n${value}\nEOF\n`);
                }
                // Signal success
                core.info(`Injected ${Object.keys(envObj).length} environment variables`);
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
