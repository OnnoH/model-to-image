import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ROOT = join(__dirname, '..');

// the configuration the board approved in ONN-26
const EXPECTED_CONFIG = {
  '$schema': 'https://docs.renovatebot.com/renovate-schema.json',
  extends: [ 'config:recommended' ],
  packageRules: [
    {
      description: 'Merge minor, patch, pin and digest updates once CI is green; majors wait for a maintainer.',
      matchUpdateTypes: [ 'minor', 'patch', 'pin', 'digest' ],
      automerge: true
    }
  ]
};

// renovate is not a dependency of this package; the validator comes from the
// registry, which takes about a minute on a cold npm cache
const VALIDATOR_TIMEOUT = 600_000;

test('ONN-26 @AC-1: renovate.json at the repo root holds the approved configuration', function() {
  const config = JSON.parse(readFileSync(join(ROOT, 'renovate.json'), 'utf8'));

  assert.deepEqual(config, EXPECTED_CONFIG);
});

test('ONN-26 @AC-2: renovate-config-validator accepts renovate.json', { timeout: VALIDATOR_TIMEOUT }, function() {
  const result = spawnSync(
    'npx',
    [ '--yes', '--package', 'renovate', 'renovate-config-validator', 'renovate.json' ],
    { cwd: ROOT, encoding: 'utf8', timeout: VALIDATOR_TIMEOUT }
  );

  assert.equal(
    result.status,
    0,
    `renovate-config-validator exited ${result.status}:\n${result.stderr || result.stdout}`
  );
});

// AC-3 and AC-4 are about the pull request itself -- the state of the checks on
// its head commit, and the paths it changes against its base -- which no job
// inside the same run can observe. They are the handoff gate,
// scripts/verify-handoff.js, run against the pull request before QA.
