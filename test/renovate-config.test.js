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

// AC-3 is about the state of the checks on the pull request head at handoff
// time, which no job inside the same run can observe; it is the handoff gate,
// scripts/verify-pr-checks.js.

function git(args) {
  return spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
}

// the base of the branch under test: the pull request base on CI, main locally
function baseCommit() {
  const base = process.env.GITHUB_BASE_REF || 'main';

  // the CI checkout is shallow and has no ref for the base branch, so fetch it
  const fetch = git([ 'fetch', '--no-tags', 'origin', `+refs/heads/${base}:refs/onn-26/base` ]);

  if (fetch.status === 0) {
    return 'refs/onn-26/base';
  }

  for (const candidate of [ `refs/remotes/origin/${base}`, `refs/heads/${base}` ]) {
    if (git([ 'rev-parse', '--verify', '--quiet', candidate ]).status === 0) {
      return candidate;
    }
  }

  throw new Error(`cannot resolve base branch ${base}: ${fetch.stderr}`);
}

// the paths this branch changes against its base; on a pull_request checkout
// HEAD is the merge commit, so this is exactly the pull request's diff
function changedPaths() {
  const diff = git([ 'diff', '--name-only', baseCommit(), 'HEAD' ]);

  assert.equal(diff.status, 0, `git diff failed: ${diff.stderr}`);

  return diff.stdout.split('\n').filter(function(line) {
    return line !== '';
  });
}

test('ONN-26 @AC-4: the branch changes no file under .github/ against its base', function(t) {
  const changed = changedPaths();

  // in the log, so a reviewer sees which paths the check looked at
  t.diagnostic(`changed against ${process.env.GITHUB_BASE_REF || 'main'}: ${changed.join(', ') || '(nothing)'}`);

  const underGithub = changed.filter(function(path) {
    return path === '.github' || path.startsWith('.github/');
  });

  assert.deepEqual(
    underGithub,
    [],
    `.github/ is the board's as code owner; this branch changes:\n${underGithub.join('\n')}`
  );
});
