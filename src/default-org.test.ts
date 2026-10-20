import { afterEach, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { ApiError, Models } from '@pulumi/cloud-sdk';
import { resolveDefaultOrg } from './default-org.js';

const user = Models.User.newInstance({ githubLogin: 'user-b' });

afterEach(() => {
    delete process.env.PULUMI_DEFAULT_ORGANIZATION;
});

test('uses PULUMI_DEFAULT_ORGANIZATION before Pulumi Cloud', async () => {
    process.env.PULUMI_DEFAULT_ORGANIZATION = 'org-env';
    const users = {
        GetDefaultOrganization: () => assert.fail('unexpected call'),
        GetCurrentUser: () => assert.fail('unexpected call'),
    };
    assert.equal(await resolveDefaultOrg(users), 'org-env');
});

test('uses the default org that Pulumi Cloud picks', async () => {
    const users = {
        GetDefaultOrganization: async () => Models.AppGetDefaultOrganizationResponse.newInstance({ GitHubLogin: 'org-a' }),
        GetCurrentUser: async () => user,
    };
    assert.equal(await resolveDefaultOrg(users), 'org-a');
});

test('uses the user when Pulumi Cloud picks no default org', async () => {
    const users = {
        GetDefaultOrganization: async () => Models.AppGetDefaultOrganizationResponse.newInstance({ GitHubLogin: '' }),
        GetCurrentUser: async () => user,
    };
    assert.equal(await resolveDefaultOrg(users), 'user-b');
});

test('uses the user when the backend has no default-org endpoint', async () => {
    const users = {
        GetDefaultOrganization: async () => {
            throw new ApiError(404, 'Not Found', undefined, 'https://example.com/api/user/organizations/default');
        },
        GetCurrentUser: async () => user,
    };
    assert.equal(await resolveDefaultOrg(users), 'user-b');
});

test('fails on any other default-org error', async () => {
    const error = new ApiError(401, 'Unauthorized', undefined, 'https://example.com/api/user/organizations/default');
    const users = {
        GetDefaultOrganization: async () => {
            throw error;
        },
        GetCurrentUser: async () => user,
    };
    await assert.rejects(resolveDefaultOrg(users), error);
});
