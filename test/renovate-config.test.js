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

test('ONN-26 @AC-3: the ci workflow runs on every pull request, so a change to the config is always checked', function() {
  const workflow = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');

  // a cheap structural check; the repo has no YAML parser among its dependencies
  assert.match(workflow, /^on:$/m, 'ci.yml has no trigger block');
  assert.match(workflow, /^ {2}pull_request:$/m, 'ci.yml does not run on pull_request');
});

test('ONN-26 @AC-4: the Renovate configuration lives at the repo root, not under .github/', function() {
  const result = spawnSync(
    'git',
    [ 'ls-files', '--', '.github/renovate.json', '.github/renovate.json5', '.github/dependabot.yml', '.github/dependabot.yaml' ],
    { cwd: ROOT, encoding: 'utf8' }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    result.stdout.trim(),
    '',
    `dependency configuration under .github/ would need the board as code owner:\n${result.stdout}`
  );
});
