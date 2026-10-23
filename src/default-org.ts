import * as core from '@actions/core';
import { ApiError, type ApiService } from '@pulumi/cloud-sdk';
import { exponentialDelay } from 'axios-retry';
import { setTimeout } from 'timers/promises';

const RETRIES = 5;

type Users = Pick<ApiService['Users'], 'GetDefaultOrganization' | 'GetCurrentUser'>;

// fetch rejects with a TypeError when the request does not get a response.
function isTransient(error: unknown): boolean {
    if (error instanceof ApiError) {
        return error.status === 429 || error.status >= 500;
    }
    return error instanceof TypeError;
}

// Retry the same failures as the axios client that opens the environment.
async function withRetries<T>(description: string, call: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
        try {
            return await call();
        } catch (error) {
            if (attempt > RETRIES || !isTransient(error)) {
                throw error;
            }
            core.info(`Retrying ${description} (attempt ${attempt}/${RETRIES}): ${(error as Error).message}`);
            await setTimeout(exponentialDelay(attempt));
        }
    }
}

// Resolve the org the same way the Pulumi CLI does, minus the CLI's local config file:
// PULUMI_DEFAULT_ORGANIZATION, then the org that Pulumi Cloud picks as the default, then the user's own org.
export async function resolveDefaultOrg(users: Users): Promise<string> {
    const fromEnv = process.env.PULUMI_DEFAULT_ORGANIZATION;
    if (fromEnv) {
        return fromEnv;
    }

    try {
        const { GitHubLogin } = await withRetries('GET default organization', () => users.GetDefaultOrganization());
        if (GitHubLogin) {
            return GitHubLogin;
        }
    } catch (error) {
        // A backend without the endpoint leaves the choice to the client.
        if (!(error instanceof ApiError) || error.status !== 404) {
            throw error;
        }
    }

    const { githubLogin } = await withRetries('GET current user', () => users.GetCurrentUser());
    if (!githubLogin) {
        throw new Error('The current user has no user name');
    }
    return githubLogin;
}
