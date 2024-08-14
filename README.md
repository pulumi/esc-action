# `esc open` action

This action opens a Pulumi ESC environment and projects all environment variables into the workflow for use in future commands.

## Inputs

### `environment`

**Required** The name of the environment to open.

## Outputs

### `time`

The time the environment was opened.

## Example usage

```yaml
uses: komalali/esc-action@e76147da8e5c81eaf017dede5645551d4b94427b
with:
  environment: staging
```
