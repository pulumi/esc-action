# Pulumi ESC action

[Pulumi ESC](https://www.pulumi.com/docs/esc/) makes it easy to share Environments, Secrets and Configuration with your team. It solves the problem of outdated .env files, secrets sprawl caused by copy/pasting from one system to another and secure access to shared services. Pulumi ESC fits seamlessly into any developer workflow with support for popular secret stores, short-lived OIDC tokens and integrations for popular developer tools and CI/CD platforms. 

For example, you may have a CI/CD pipeline that builds, tests and deploys your application. You may need API keys, Cloud provider credentials, or other secrets to be able to test and release your application. You can use this action to securely inject those secrets directly into the GitHub Action workflow where they are needed, without needing to store them separately. 

With ESC's support for dynamic credentials and automatic secret rotation, you can be sure that the secrets you are injecting are valid at the time of use, but are automatically expired after a certain time period.

## Functionality

- If no inputs are passed, this action will download the latest version of the Pulumi ESC CLI for direct use in later steps of the workflow. 
- If a version is specified, that specific version of the CLI will be downloaded.
- If an `environment` is is passed in as an input, the action will inject all environment variables (specifically the keys under `values.environmentVariables` and projected files under `values.files`) from the environment into the current action/workflow environment.
- If specific keys are passed in using the `keys` input - only those keys from the `values.environmentVariables` or `values.files` objects will be injected into the current action.

## Inputs

### `version`

**Optional** The version of the ESC CLI to download. If not specified, the latest version will be downloaded.

### `environment`

**Optional** The name of the environment to open. If not specified, the action will not open an environment.

### `keys`

**Optional** A comma-separated list of keys to inject into the current action/workflow environment. If not specified, all keys from the environment will be injected.

### `cloud-url`

**Optional** The URL of the Pulumi Cloud API to use. If not specified, the default URL of https://api.pulumi.com will be used.

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
  keys: SOME_KEY,ANOTHER_KEY,LAST_KEY
env:
  PULUMI_ACCESS_TOKEN: ${{ secrets.PULUMI_ACCESS_TOKEN }}
```

### Full example using pulumi/auth-actions for authentication

It is recommended to use the [pulumi/auth-actions](https://github.com/pulumi/auth-actions) action to authenticate with the Pulumi Cloud API. This action will automatically set the `PULUMI_ACCESS_TOKEN` environment variable for you.

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
