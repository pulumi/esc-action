# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Migrated action runtime from Node.js 20 to Node.js 24, in line with
  [GitHub's Node 20 deprecation](https://github.blog/changelog/2025-09-16-github-actions-default-runtime-updated-to-node24/).
  No action inputs or outputs have changed. ([#40](https://github.com/pulumi/esc-action/issues/40))

### Upgrade notes

GitHub-hosted runners (`ubuntu-latest`, `windows-latest`, `macos-latest`) are
unaffected. **Self-hosted runners** must meet two requirements:

- `actions/runner` v2.327.0 or newer (released September 2025), which bundles
  the Node 24 runtime.
- A Linux distribution with GLIBC 2.28+ (Ubuntu 20.04+, RHEL 8+, Debian 10+,
  Amazon Linux 2023+). Node 24 will not start on RHEL/CentOS 7, Ubuntu 18.04,
  Amazon Linux 2, or Debian 9. The same constraint applies to any
  `container:`-based job using an older base image.

---

For releases prior to this entry, see
[GitHub Releases](https://github.com/pulumi/esc-action/releases).
