#!/bin/sh
set -e

if [ -z "$INPUT_ENV_NAME" ]; then
    echo "env-name input variable not set"
    exit 1
fi

curl -fsSL https://get.pulumi.com/esc/install.sh | sh

~/.pulumi/bin/esc env open "$INPUT_ENV_NAME" --format dotenv >> "$GITHUB_ENV"
