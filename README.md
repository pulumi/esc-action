# Pulumi ESC action

[Pulumi ESC](https://www.pulumi.com/docs/esc/) (Environments, Secrets, and Configuration) allows teams to tackle secrets and configuration complexity for modern cloud environments, alleviating maintenance burden and reducing costly mistakes, and creating a “secure by default” posture.

- Minimally, this action will download the Pulumi ESC CLI. If a version is specified, that version will be downloaded.
- Optionally, if an environment is specified, the action will inject all environment variables from the environment into the current action/workflow environment.
- If specific keys are passed in using the keys input - only those keys will be injected into the current action.

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
