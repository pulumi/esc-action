# Pulumi ESC action

[Pulumi ESC](https://www.pulumi.com/docs/esc/) makes it easy to share Environments, Secrets and Configuration with your team. It solves the problem of outdated .env files, secrets sprawl caused by copy/pasting from one system to another and secure access to shared services. Pulumi ESC fits seamlessly into any developer workflow with support for popular secret stores, short-lived OIDC tokens and integrations for popular developer tools and CI/CD platforms. 

For example, you may have a CI/CD pipeline that builds, tests and deploys your application. You may need API keys, Cloud provider credentials, or other secrets to be able to test and release your application. You can use this action to securely inject those secrets directly into the GitHub Action workflow where they are needed, without needing to store them separately. 

With ESC's support for dynamic credentials and automatic secret rotation, you can be sure that the secrets you are injecting are valid at the time of use, but are automatically expired after a certain time period.

## Functionality

- If no inputs are passed, this action will download the latest version of the Pulumi ESC CLI for direct use in later steps of the workflow. 
- If a version is specified, that specific version of the CLI will be downloaded.
- If an `environment` is is passed in as an input, the action will inject all environment variables (specifically the keys under `environmentVariables` and projected files under `files`) from the environment into the current action/workflow environment.
- If mappings are passed via the `export-environment-variables` input - only the mapped secrets from the environment's `environmentVariables` or `files` objects will be injected into the current action.
- All secrets from the environment's `environmentVariable` and `files` objects are available as step outputs

## Inputs

_NOTE_: All parameters can be passed via environment variables as well as inputs. If a parameter is present as an input and an environment variable, the input is preferred.

### `version` (`ESC_ACTION_VERSION`)

**Optional** The version of the ESC CLI to download. If not specified, the latest version will be downloaded.

### `environment` (`ESC_ACTION_ENVIRONMENT`)

**Optional** The name of the environment to open. If not specified, the action will not open an environment.

### `cloud-url` (`ESC_ACTION_CLOUD_URL`)

**Optional** The URL of the Pulumi Cloud API to use. If not specified, the default URL of https://api.pulumi.com will be used.

### `export-environment-variables` (`ESC_ACTION_EXPORT_ENVIRONMENT_VARIABLES`)

**Optional** The secrets to export as environment variables available to subsequent steps.

The value is either a boolean or a string:

1. When omitted or `true`, all environment variables are exported
2. When `false`, no environment variables are exported
3. Otherwise, the value is a list of export mappings

For case (3), each _export mapping_ takes one of the following three forms:

1. `ENV=SECRET`, which maps the ESC secret named `SECRET` to the environment variable `ENV`
2. `SECRET`, which maps the ESC secret named `SECRET` to the environment variable `SECRET` (equivalent to `SECRET=SECRET`)
3. `*`, which adds identity mappings for any unmapped secrets

### `oidc-auth` (`ESC_ACTION_OIDC_AUTH`)

**Optional** When this input is `true`, the ESC action will exchange the GitHub workflow's OIDC token for a Pulumi Access Token. This token is not available to other steps. Requires `id-token: write` permission.

### `oidc-organization` (`ESC_ACTION_OIDC_ORGANZATION`)

**Optional** The name of the Pulumi organization to use for OIDC token exchange. Required if `oidc-auth` is true.

### `oidc-requested-token-type` (`ESC_ACTION_OIDC_REQUESTED_TOKEN_TYPE`)

**Optional** The type of Pulumi Access Token to obtain. Reqiured if `oidc-auth` is true.

### `oidc-scope` (`ESC_ACTION_OIDC_SCOPE`)

**Optional** The requested scopes for the Pulumi Access Token.

### `oidc-expiration` (`ESC_ACTION_OIDC_TOKEN_EXPIRATION`)

**Optional** The time-to-live for the Pulumi Access Token.

## Deprecated inputs

### `keys` (`ESC_ACTION_KEYS`)

**Optional** (_Deprecated in favor of export-environment-variables_) A comma-separated list of keys to inject into the current action/workflow environment. If not specified, all keys from the environment will be injected.

## Example usage

### Download the latest version of the ESC CLI

```yaml
uses: pulumi/esc-action@v1
```

### Download a specific version of the ESC CLI

```yaml
uses: pulumi/esc-action@v1
with:
  version: 0.10.0
```

### Open an environment and inject all environment variables

```yaml
uses: pulumi/esc-action@v1
with:
  environment: my-org/my-project/my-env
env:
  PULUMI_ACCESS_TOKEN: ${{ secrets.PULUMI_ACCESS_TOKEN }}
```

### Open an environment and inject specific environment variables

```yaml
uses: pulumi/esc-action@v1
with:
  environment: my-org/my-project/my_enc
  export-environment-variables: SOME_KEY,ANOTHER_KEY,LAST_KEY
env:
  PULUMI_ACCESS_TOKEN: ${{ secrets.PULUMI_ACCESS_TOKEN }}
```

### Example using pulumi/auth-actions for authentication

It it recommended to use OIDC to authenticate with the Pulumi Cloud API. This can be done via the ESC action's own OIDC configuration or using the [pulumi/auth-actions](https://github.com/pulumi/auth-actions) action to authenticate with the Pulumi Cloud API. This action can automatically set the `PULUMI_ACCESS_TOKEN` environment variable for you.

```yaml
on:
  - pull_request

permissions:
  id-token: write
  contents: read

jobs:
  test-all-key-injection:
    runs-on: ubuntu-latest
    steps:
      - name: Check out repository
        uses: actions/checkout@v4
      - name: Authenticate with Pulumi Cloud
        uses: pulumi/auth-actions@v1
        with:
          organization: pulumi
          requested-token-type: urn:pulumi:token-type:access_token:organization
      - name: Install and inject ESC environment variables
        uses: pulumi/esc-action@v1
        with:
          environment: 'pulumi/github/esc-action'
      - name: Verify environment variables were injected
        run: |
          echo "Testing env injection..."
          echo "FOO=$FOO"
          echo "SOME_IMPORTANT_KEY=$SOME_IMPORTANT_KEY"
          echo "TEST_ENV=$TEST_ENV"
```

### Example using workflow environment variables for global configuration

```yaml
on: [pull_request]

permissions:
  id-token: write

env:
  ESC_ACTION_ENVIRONMENT=my-org/github/secrets
  ESC_ACTION_EXPORT_ENVIRONMENT_VARIABLES=AWS_ACCESS_KEY_ID,AWS_SECRET_ACCESS_KEY,AWS_SESSION_TOKEN
  ESC_ACTION_OIDC_AUTH=true
  ESC_ACTION_OIDC_ORGANZATION=my-org
  ESC_ACTION_OIDC_REQUESTED_TOKEN_TYPE=urn:pulumi:token-type:access_token:organization

jobs:
  job-1:
    steps:
      - name: Fetch secrets from ESC
        id: esc-secrets
        uses: pulumi/esc-action@v1
      - name: `pulumi up`
        run: pululmi up
        env:
          PULUMI_ACCESS_TOKEN: ${{ steps.esc-secrets.outputs.ORG_TOKEN }}
  job-2:
     - uses: pulumi/esc-action@v1
     - name: list buckets
       run: aws s3 ls
```
