// The process-environment projection of an opened ESC environment: the flat set
// of environment variables (and file-path variables) a process would see, each
// tagged with whether ESC considers it secret.
//
// `pulumi env open --format process:json-detailed` emits this directly as a JSON
// object of `{ "<name>": { "value": string, "secret": boolean } }`. Older CLIs
// don't support that format, so we fall back to `--format dotenv` and treat
// every value as secret (the pre-existing, over-masking behavior).

import * as rt from 'runtypes'

export type ProcessEnvironmentEntry = { value: string; secret: boolean }
export type ProcessEnvironment = Record<string, ProcessEnvironmentEntry>

const ProcessEnvironmentRuntype = rt.Dictionary(
  rt.Record({ value: rt.String, secret: rt.Boolean }),
  rt.String
)

// Parses the JSON emitted by `pulumi env open --format process:json-detailed`.
export function parseProcessJsonDetailed(stdout: string): ProcessEnvironment {
  const parsed = JSON.parse(stdout)
  return ProcessEnvironmentRuntype.check(parsed)
}

// Adapts the legacy `--format dotenv` projection to the same shape. dotenv carries
// no secret flag, so every value is marked secret, preserving the pre-existing
// masking behavior on older CLIs.
export function dotenvToProcessEnvironment(
  dotenv: Record<string, string>
): ProcessEnvironment {
  const env: ProcessEnvironment = {}
  for (const [key, value] of Object.entries(dotenv)) {
    env[key] = { value, secret: true }
  }
  return env
}

// Reports whether a `pulumi env open` failure was the CLI not recognizing the
// format, rather than a real error (missing environment, auth failure, ...), so the
// caller can decide whether to fall back to dotenv.
export function isUnknownFormatError(stderr: string): boolean {
  return /unknown output format|not a valid object:encoding pair|unknown output object|unknown output encoding/i.test(
    stderr
  )
}
