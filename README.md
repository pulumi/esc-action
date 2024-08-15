# Pulumi ESC GitHub Actions

Access environment variables from your Pulumi
[ESC](https://www.pulumi.com/product/esc/) environment in GitHub Actions.

## Getting Started

```yaml
name: Pulumi
on:
  push:
    branches:
      - main
jobs:
  job:
    runs-on: ubuntu-latest
    steps:
      # Load environment variables from environment `my-env`
      - uses: pulumi/esc-action
        with:
          env-name: my-env
        env:
          PULUMI_ACCESS_TOKEN: ${{ secrets.PULUMI_ACCESS_TOKEN }}

      # Now you can access any environment variable from your environment
      - run: echo "Got ${{ env.MY_VAR }}!"
```

## Configuration

- `env-name` (required) - the name of your ESC environment
