#!/usr/bin/env node

// The ONN-26 handoff gate: the criteria about the pull request itself, which no
// job inside the run can observe. Run it against the pull request before
// handing the issue to QA:
//
//   npm run verify:handoff -- <pull-request-number>
//
// ONN-26 @AC-3: every check on the head commit is completed and successful.
// ONN-26 @AC-4: the pull request changes no file under .github/.
//
// Exits 0 when both hold, 1 otherwise, naming the head commit, every check it
// saw and every path the pull request changes. It is a gate on this handoff,
// not a repository rule: nothing runs it in CI, so it never blocks a later
// pull request that does change .github/ with the board's review.

import { spawnSync } from 'node:child_process';

const PASSING_CONCLUSIONS = [ 'SUCCESS', 'NEUTRAL', 'SKIPPED' ];

function gh(args) {
  const result = spawnSync('gh', args, { encoding: 'utf8' });

  if (result.status !== 0) {
    throw new Error(`gh ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
  }

  return JSON.parse(result.stdout);
}

function pullRequestNumber() {
  const argument = process.argv[2] || process.env.PR_NUMBER;

  if (argument) {
    return argument;
  }

  throw new Error('no pull request given: npm run verify:handoff -- <pull-request-number>');
}

// a check is a check run, a commit status or a required workflow run; they
// report their state under different keys
function stateOf(check) {
  const name = check.name || check.context || '(unnamed)';

  if (check.__typename === 'StatusContext') {
    const state = (check.state || '').toUpperCase();

    return {
      name,
      status: state,
      conclusion: state === 'PENDING' ? null : state,
      completedAt: state === 'PENDING' ? null : check.createdAt || null
    };
  }

  return {
    name,
    status: (check.status || '').toUpperCase(),
    conclusion: check.conclusion ? check.conclusion.toUpperCase() : null,
    completedAt: check.completedAt || null
  };
}

// GitHub keeps reporting IN_PROGRESS for a while after a job has finished, so
// what says a check is done is a conclusion together with a completion time
function isFinished(check) {
  return check.status === 'COMPLETED' || Boolean(check.conclusion && check.completedAt);
}

// ONN-26 @AC-3
function verifyChecks(pr) {
  const checks = (pr.statusCheckRollup || []).map(stateOf);

  if (checks.length === 0) {
    console.error('ONN-26 @AC-3: FAIL no checks reported for the head commit; nothing proves the branch is green');
    return false;
  }

  const failing = [];

  for (const check of checks) {
    const passing = isFinished(check) && PASSING_CONCLUSIONS.includes(check.conclusion);

    console.log(`  ${passing ? 'ok  ' : 'FAIL'} ${check.name}: ${check.status} ${check.conclusion || 'no conclusion'} ${check.completedAt || ''}`.trimEnd());

    if (!passing) {
      failing.push(check);
    }
  }

  if (failing.length > 0) {
    console.error(`ONN-26 @AC-3: FAIL ${failing.length} of ${checks.length} checks on ${pr.headRefOid} are not completed and successful`);
    return false;
  }

  console.log(`ONN-26 @AC-3: ok all ${checks.length} checks on ${pr.headRefOid} completed successfully`);
  return true;
}

// ONN-26 @AC-4: GitHub reports the files of the pull request against its base
function verifyNoGithubChanges(pr) {
  const changed = (pr.files || []).map(function(file) {
    return file.path;
  });

  if (changed.length === 0) {
    console.error('ONN-26 @AC-4: FAIL GitHub reports no files for this pull request');
    return false;
  }

  console.log(`  changed against ${pr.baseRefName}: ${changed.join(', ')}`);

  const underGithub = changed.filter(function(path) {
    return path === '.github' || path.startsWith('.github/');
  });

  if (underGithub.length > 0) {
    console.error(`ONN-26 @AC-4: FAIL this pull request changes ${underGithub.join(', ')}; .github/ is out of scope for ONN-26`);
    return false;
  }

  console.log(`ONN-26 @AC-4: ok none of the ${changed.length} changed paths is under .github/`);
  return true;
}

function main() {
  const number = pullRequestNumber();
  const pr = gh([
    'pr', 'view', number,
    '--json', 'headRefOid,headRefName,baseRefName,statusCheckRollup,files'
  ]);

  console.log(`pull request #${number} (${pr.headRefName} -> ${pr.baseRefName}) at ${pr.headRefOid}`);

  // both run, so a failing handoff names everything that is wrong at once
  const results = [ verifyChecks(pr), verifyNoGithubChanges(pr) ];

  if (results.includes(false)) {
    process.exitCode = 1;
    return;
  }

  console.log('handoff gate: ONN-26 AC-3 and AC-4 hold');
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
