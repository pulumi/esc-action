import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as fs from 'fs';
import * as path from 'path';
import { lookpath } from 'lookpath';

async function run(): Promise<void> {
    try {
        // Parse inputs
        const escVersion: string = core.getInput('version');
        const environment: string = core.getInput('environment');
        const keys: string = core.getInput('keys');
        const cloudUrl: string = core.getInput('cloud-url');

        /*
          Install ESC CLI (either the latest or a specific version)

          The official installation script supports an optional `--version` argument to pin a release.
          e.g. curl -fsSL https://get.pulumi.com/esc/install.sh | sh -s -- --version 0.10.0

          If no version is specified, it installs the latest automatically.
        */

        // If the CLI is already installed, skip the installation step
        const escExists = await lookpath('esc');
        if (escExists) {
            core.info('ESC CLI is already installed, skipping installation step.');
        } else {
            let cmd = 'curl -fsSL https://get.pulumi.com/esc/install.sh | sh';

            if (escVersion) {
                cmd += ` -s -- --version ${escVersion}`;
            }

            // Prepare the shell command arguments
            const shArgs = ['-c', cmd];

            // Execute the installation
            core.startGroup('Installing ESC CLI');
            await exec.exec('sh', shArgs);
            core.endGroup();

            // Add $HOME/.pulumi/bin to the PATH so `esc` is available.
            const pulumiBinPath = path.join(process.env.HOME || '', '.pulumi', 'bin');
            core.addPath(pulumiBinPath);
        }

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
Exit Code: ${result.exitCode}
Stderr: ${result.stderr}
Stdout: ${result.stdout}
`);
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
