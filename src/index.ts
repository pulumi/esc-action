import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as fs from 'fs';
import * as path from 'path';

async function run(): Promise<void> {
    try {
        //
        // 1) Parse inputs
        //
        const escVersion: string = core.getInput('version');
        const environment: string = core.getInput('environment');
        const keys: string = core.getInput('keys');
        let injectAll = false;

        if (!keys) {
            injectAll = true;
        }

        //
        // 2) Install ESC CLI (either the latest or a specific version)
        //
        // The official installation script supports an optional `--version` argument to pin a release.
        // e.g. curl -fsSL https://get.pulumi.com/esc/install.sh | sh -s -- --version 0.10.0
        //
        // If no version is specified, it installs the latest automatically.
        //


        // If the CLI is already installed, skip the installation step
        const escPath = path.join(process.env.HOME || '', '.pulumi', 'bin', 'esc');
        if (fs.existsSync(escPath)) {
            core.info('ESC CLI is already installed, skipping installation step.');
        } else {
            const installArgs = ['-fsSL', 'https://get.pulumi.com/esc/install.sh'];

            // Build an array of args for the shell to pass to `sh`.
            const shArgs: string[] = ['-c'];
            if (escVersion) {
                shArgs.push(`curl ${installArgs.join(' ')} | sh -s -- --version ${escVersion}`);
            } else {
                shArgs.push(`curl ${installArgs.join(' ')} | sh`);
            }

            // Execute the installation
            core.startGroup('Installing ESC CLI');
            await exec.exec('sh', shArgs);
            core.endGroup();

            // Add $HOME/.pulumi/bin to the PATH so `esc` is available.
            const pulumiBinPath = path.join(process.env.HOME || '', '.pulumi', 'bin');
            core.addPath(pulumiBinPath);
        }

        //
        // 3) Inject environment variables if requested
        //
        // Check if an environment was provided. If not, skip injection.
        if (environment) {
            // Open the environment.
            core.startGroup(`Injecting environment variables from ESC environment: ${environment}`);
            const result = await exec.getExecOutput(
              'esc',
              ['open', environment, 'environmentVariables'],
              { silent: true }
            );

            // Parse the JSON into an object
            let envObj: Record<string, string> = {};
            try {
                envObj = JSON.parse(result.stdout);
            } catch (parseErr) {
                core.error(`Failed to parse JSON output: ${parseErr}`);
                return;
            }

            const envFilePath = process.env.GITHUB_ENV;
            if (!envFilePath) {
                core.error('GITHUB_ENV is not defined. Cannot append environment variables.');
                return;
            }

            // If user wants to inject specific variables:
            if (keys) {
                const variables = keys.split(',').map(v => v.trim()).filter(Boolean);
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
            }

            // If user wants to inject all environment variables:
            if (injectAll) {
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
