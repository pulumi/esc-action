# `esc` action

- Minimally, this action will download the ESC CLI. If a version is specified, that version will be downloaded.
- Optionally, if an environment is specified, the action will inject all environment variables from the environment into the current action/workflow environment.
- If only specific keys are passed in using the keys input - only those keys will be injected into the current action.

## Inputs

### `version`

**Optional** The version of the ESC CLI to download. If not specified, the latest version will be downloaded.

### `environment`

**Optional** The name of the environment to open. If not specified, the action will not open an environment.

### `keys`

**Optional** A comma-separated list of keys to inject into the current action/workflow environment. If not specified, all keys from the environment will be injected.

## Example usage

```yaml
uses: pulumi/esc-action@v1
with:
  environment: my-org/my-project/my-env
```
