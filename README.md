# Pulumi ESC action

[Pulumi ESC](https://www.pulumi.com/docs/esc/) makes it easy to share Environments, Secrets and Configuration with your team. It solves the problem of outdated .env files, secrets sprawl caused by copy/pasting from one system to another and secure access to shared services. Pulumi ESC fits seamlessly into any developer workflow with support for popular secret stores, short-lived OIDC tokens and integrations for popular developer tools and CI/CD platforms. 

For example, you may have a CI/CD pipeline that builds, tests and deploys your application. You may need API keys, Cloud provider credentials, or other secrets to be able to test and release your application. You can use this action to securely inject those secrets directly into the GitHub Action workflow where they are needed, without needing to store them separately. 

With ESC's support for dynamic credentials and automatic secret rotation, you can be sure that the secrets you are injecting are valid at the time of use, but are automatically expired after a certain time period.

## Functionality

- The action opens the ESC `environment` through the Pulumi Cloud API.
- The action writes each value under the environment's `files` object to a temporary file. The environment variable with the same key holds the path to that file. If a key is in both `environmentVariables` and `files`, the file path wins.
- All environment variables (the keys under `environmentVariables`, and the file paths) are available as step outputs.
- By default, the action exports all environment variables to the later steps of the job. The `export-environment-variables` input selects which ones to export.

To install the Pulumi CLI, use [pulumi/actions](https://github.com/pulumi/actions). To get a Pulumi access token through OIDC, use [pulumi/auth-actions](https://github.com/pulumi/auth-actions).

## Inputs

_NOTE_: All parameters can be passed via environment variables as well as inputs. If a parameter is present as an input and an environment variable, the input is preferred.

### `environment` (`ESC_ACTION_ENVIRONMENT`)

**Required** The name of the environment to open. The name takes one of these forms:

| Form                            | Example                    | Opens                             |
|---------------------------------|----------------------------|-----------------------------------|
| `<environment>`                 | `my-env`                   | `<default org>/default/my-env`    |
| `<project>/<environment>`       | `my-project/my-env`        | `<default org>/my-project/my-env` |
| `<org>/<project>/<environment>` | `my-org/my-project/my-env` | `my-org/my-project/my-env`        |

Each form can end with `@<version>`, where the version is a revision number or a tag. For example, `my-org/my-project/my-env@stable` opens the revision with the `stable` tag.

The default org is the first one of these that is set:

1. The `PULUMI_DEFAULT_ORGANIZATION` environment variable.
2. The default org that Pulumi Cloud selects for the access token.
3. The name of the user that owns the access token.

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

Mappings may be separated by commas, newlines, or both. This means the value can be given either as
a single-line comma-separated list (`SOME_KEY,ANOTHER_KEY,LAST_KEY`) or as a YAML block scalar with
one mapping per line, e.g.:

```yaml
export-environment-variables: |
  SOME_KEY
  ANOTHER_KEY
  LAST_KEY
```

### `pulumi-access-token` (`PULUMI_ACCESS_TOKEN`)

**Optional** The Pulumi access token to use. If not specified, the action uses the `PULUMI_ACCESS_TOKEN` environment variable. If neither is set, the action fails.

## Example usage

### Open an environment and inject all environment variables

```yaml
uses: pulumi/esc-action@v4
with:
  environment: my-org/my-project/my-env
env:
  PULUMI_ACCESS_TOKEN: ${{ secrets.PULUMI_ACCESS_TOKEN }}
```

### Open an environment and inject specific environment variables

```yaml
uses: pulumi/esc-action@v4
with:
  environment: my-org/my-project/my-env
  export-environment-variables: SOME_KEY,ANOTHER_KEY,LAST_KEY
env:
  PULUMI_ACCESS_TOKEN: ${{ secrets.PULUMI_ACCESS_TOKEN }}
```

### Example using pulumi/auth-actions for authentication

It is recommended to use OIDC to authenticate with the Pulumi Cloud API. The [pulumi/auth-actions](https://github.com/pulumi/auth-actions) action exchanges the workflow's OIDC token for a Pulumi access token and sets the `PULUMI_ACCESS_TOKEN` environment variable for you.

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
      - name: Inject ESC environment variables
        uses: pulumi/esc-action@v4
        with:
          environment: 'pulumi/github/esc-action'
      - name: Verify environment variables were injected
        run: |
          echo "Testing env injection..."
          echo "FOO=$FOO"
          echo "SOME_IMPORTANT_KEY=$SOME_IMPORTANT_KEY"
          echo "TEST_ENV=$TEST_ENV"
```

To give this action a token directly, pass it to the `pulumi-access-token` input. The input takes precedence over `PULUMI_ACCESS_TOKEN`:

```yaml
- name: Authenticate with Pulumi Cloud
  id: auth
  uses: pulumi/auth-actions@v1
  with:
    organization: my-org
    requested-token-type: urn:pulumi:token-type:access_token:organization
- uses: pulumi/esc-action@v4
  with:
    environment: my-org/my-project/my-env
    pulumi-access-token: ${{ steps.auth.outputs.pulumi-access-token }}
```

### Example using workflow environment variables for global configuration

```yaml
on: [pull_request]

env:
  ESC_ACTION_ENVIRONMENT: my-org/github/secrets
  ESC_ACTION_EXPORT_ENVIRONMENT_VARIABLES: AWS_ACCESS_KEY_ID,AWS_SECRET_ACCESS_KEY,AWS_SESSION_TOKEN
  PULUMI_ACCESS_TOKEN: ${{ secrets.PULUMI_ACCESS_TOKEN }}

jobs:
  job-1:
    runs-on: ubuntu-latest
    steps:
      - uses: pulumi/esc-action@v4
      - name: list buckets
        run: aws s3 ls
```

## Migrating from v3

v4 talks directly with the Pulumi Cloud API.

- **The action does not install the Pulumi CLI.** If a later step runs `pulumi`, add [pulumi/actions](https://github.com/pulumi/actions) to install it. The `version` input is removed.

  ```yaml
  - uses: pulumi/esc-action@v4
    with:
      environment: my-org/my-project/my-env
  - uses: pulumi/actions@v7
  ```

- **The OIDC inputs are removed.** Remove `oidc-auth`, `oidc-organization`, `oidc-requested-token-type`, `oidc-scope` and `oidc-token-expiration`. Use [pulumi/auth-actions](https://github.com/pulumi/auth-actions) before this action instead. Its inputs have the same meaning:

  | v3 input                    | pulumi/auth-actions input |
  |-----------------------------|---------------------------|
  | `oidc-organization`         | `organization`            |
  | `oidc-requested-token-type` | `requested-token-type`    |
  | `oidc-scope`                | `scope`                   |
  | `oidc-token-expiration`     | `token-expiration`        |

- **The `keys` input is removed.** Use `export-environment-variables` with the same list.
- **The `environment` input is required.** To only install the Pulumi CLI, use [pulumi/actions](https://github.com/pulumi/actions).
- **A 2-part name is always `<project>/<environment>`.** In v3, the Pulumi CLI also read a 2-part name as the legacy `<org>/<environment>` form, which is `<org>/default/<environment>`. v4 does not. If you use the legacy form, change it to the 3-part form `<org>/default/<environment>`. If you do not, v4 looks for a project with your org's name in your default org, and the open fails.
- **The action does not read `~/.pulumi/credentials.json`.** A `pulumi login` in an earlier step does not authenticate this action. Set `PULUMI_ACCESS_TOKEN` or the `pulumi-access-token` input.
- **File paths are not masked.** In v3, the path of a secret file was masked in the logs. The contents of a secret file are still masked.
