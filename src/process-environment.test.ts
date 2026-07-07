import { test } from 'node:test'
import * as assert from 'node:assert/strict'
import {
  dotenvToProcessEnvironment,
  isUnknownFormatError,
  parseProcessJsonDetailed
} from './process-environment.js'

test('parses process:json-detailed with secret flags', () => {
  const stdout = JSON.stringify({
    FOO: { value: 'bar', secret: false },
    SECRET: { value: 'shh', secret: true },
    NUM_FILE: { value: '/tmp/esc-123', secret: false }
  })

  const env = parseProcessJsonDetailed(stdout)

  assert.deepEqual(env.FOO, { value: 'bar', secret: false })
  assert.deepEqual(env.SECRET, { value: 'shh', secret: true })
  assert.deepEqual(env.NUM_FILE, { value: '/tmp/esc-123', secret: false })
})

test('rejects malformed process:json-detailed', () => {
  assert.throws(() => parseProcessJsonDetailed('{"FOO":"bar"}'))
  assert.throws(() => parseProcessJsonDetailed('not json'))
})

test('dotenv fallback marks every value secret', () => {
  const env = dotenvToProcessEnvironment({ FOO: 'bar', SECRET: 'shh' })

  assert.deepEqual(env.FOO, { value: 'bar', secret: true })
  assert.deepEqual(env.SECRET, { value: 'shh', secret: true })
})

test('detects unknown-format errors from older CLIs', () => {
  assert.ok(
    isUnknownFormatError('error: unknown output format "process:json-detailed"')
  )
  assert.ok(
    isUnknownFormatError(
      'output format "process:json-detailed" is not a valid object:encoding pair'
    )
  )
  assert.ok(!isUnknownFormatError('error: environment "acme/dev" not found'))
  assert.ok(!isUnknownFormatError('error: not logged in'))
})
