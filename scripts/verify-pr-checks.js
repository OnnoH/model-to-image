#!/usr/bin/env node

// ONN-26 @AC-3: the handoff gate. A pull request may only be handed to QA once
// every check on its head commit has completed successfully. No job inside the
// run can assert this -- it would have to wait for itself -- so the check runs
// at handoff time against the state GitHub reports for the head commit:
//
//   npm run verify:pr-checks -- <pull-request-number>
//
// Exits 0 when every check on the head commit is completed and successful,
// 1 otherwise, naming the head commit and every check it saw.

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

  throw new Error('no pull request given: npm run verify:pr-checks -- <pull-request-number>');
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

function main() {
  const number = pullRequestNumber();
  const pr = gh([ 'pr', 'view', number, '--json', 'headRefOid,headRefName,statusCheckRollup' ]);
  const checks = (pr.statusCheckRollup || []).map(stateOf);

  console.log(`pull request #${number} (${pr.headRefName}) at ${pr.headRefOid}`);

  if (checks.length === 0) {
    console.error('no checks reported for the head commit; nothing proves the branch is green');
    process.exitCode = 1;
    return;
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
    console.error(`${failing.length} of ${checks.length} checks on ${pr.headRefOid} are not completed and successful`);
    process.exitCode = 1;
    return;
  }

  console.log(`all ${checks.length} checks on ${pr.headRefOid} completed successfully`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
