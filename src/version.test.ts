import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { compareVersions, supportsDetailedFormat } from './version.js';

test('compares versions numerically, not lexically', () => {
    assert.ok(compareVersions('3.255.0', '3.99.0') > 0);
    assert.ok(compareVersions('3.9.0', '3.10.0') < 0);
    assert.equal(compareVersions('3.255.0', '3.255.0'), 0);
});

test('ignores a leading v and missing components', () => {
    assert.equal(compareVersions('v3.255.0', '3.255.0'), 0);
    assert.equal(compareVersions('3.255', '3.255.0'), 0);
    assert.ok(compareVersions('3.255.1', '3.255') > 0);
});

test('ignores prerelease and build suffixes', () => {
    assert.equal(compareVersions('3.255.0-alpha.1', '3.255.0'), 0);
    assert.equal(compareVersions('3.255.0+build.5', '3.255.0'), 0);
});

test('detailed format requires v3.255.0 or newer', () => {
    assert.ok(supportsDetailedFormat('3.255.0'));
    assert.ok(supportsDetailedFormat('3.255.1'));
    assert.ok(supportsDetailedFormat('4.0.0'));
    assert.ok(!supportsDetailedFormat('3.254.9'));
    assert.ok(!supportsDetailedFormat('3.100.0'));
    assert.ok(!supportsDetailedFormat('2.999.0'));
});

test('treats unparseable versions as legacy', () => {
    assert.ok(!supportsDetailedFormat('dev'));
});
