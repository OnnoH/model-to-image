import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { convertAll, getMode } from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BPMN_FIXTURE = join(__dirname, 'all_elements.bpmn');
const DMN_FIXTURE = join(__dirname, 'all_elements.dmn');

// rendering spins up a browser; give each conversion room
const TIMEOUT = 120_000;

const PNG_MAGIC = Buffer.from([ 0x89, 0x50, 0x4e, 0x47 ]);

let outDir;

before(function() {
  outDir = mkdtempSync(join(tmpdir(), 'model-to-image-test-'));
});

after(function() {
  rmSync(outDir, { recursive: true, force: true });
});

/**
 * Assert the file exists and holds more than zero bytes.
 */
function assertNonEmpty(file) {
  const stats = statSync(file);

  assert.ok(stats.isFile(), `${file} was not produced`);
  assert.ok(stats.size > 0, `${file} is empty`);

  return stats;
}

test('@AC-1 converts a BPMN diagram to a non-empty PNG', { timeout: TIMEOUT }, async function() {

  const output = join(outDir, 'all_elements.png');

  await convertAll([ { input: BPMN_FIXTURE, outputs: [ output ] } ], {
    minDimensions: { width: 400, height: 300 }
  });

  assertNonEmpty(output);

  const header = readFileSync(output).subarray(0, 4);

  assert.deepEqual(header, PNG_MAGIC, 'output is not a PNG');
});

test('@AC-1 converts a BPMN diagram to a non-empty SVG', { timeout: TIMEOUT }, async function() {

  const output = join(outDir, 'all_elements.svg');

  await convertAll([ { input: BPMN_FIXTURE, outputs: [ output ] } ], {
    minDimensions: { width: 400, height: 300 }
  });

  assertNonEmpty(output);

  const svg = readFileSync(output, 'utf8');

  assert.match(svg, /<svg/, 'output is not an SVG');
});

test('@AC-1 converts a DMN diagram to a non-empty PNG', { timeout: TIMEOUT }, async function() {

  const output = join(outDir, 'all_elements_dmn.png');

  await convertAll([ { input: DMN_FIXTURE, outputs: [ output ] } ], {
    minDimensions: { width: 400, height: 300 },
    dmnView: 'drd'
  });

  assertNonEmpty(output);

  const header = readFileSync(output).subarray(0, 4);

  assert.deepEqual(header, PNG_MAGIC, 'output is not a PNG');
});

test('@AC-1 converts a DMN decision table to a non-empty PNG', { timeout: TIMEOUT }, async function() {

  const output = join(outDir, 'all_elements_decision.png');

  await convertAll([ { input: DMN_FIXTURE, outputs: [ output ] } ], {
    minDimensions: { width: 400, height: 300 },
    dmnView: 'decision'
  });

  assertNonEmpty(output);
});

test('@AC-1 converts a BPMN diagram to a non-empty PDF', { timeout: TIMEOUT }, async function() {

  const output = join(outDir, 'all_elements.pdf');

  await convertAll([ { input: BPMN_FIXTURE, outputs: [ output ] } ], {
    minDimensions: { width: 400, height: 300 }
  });

  assertNonEmpty(output);

  const header = readFileSync(output, 'latin1').slice(0, 5);

  assert.equal(header, '%PDF-', 'output is not a PDF');
});

test('@AC-1 converts both fixtures in one run', { timeout: TIMEOUT }, async function() {

  const bpmnOutput = join(outDir, 'both_bpmn.png');
  const dmnOutput = join(outDir, 'both_dmn.png');

  await convertAll([
    { input: BPMN_FIXTURE, outputs: [ bpmnOutput ] },
    { input: DMN_FIXTURE, outputs: [ dmnOutput ] }
  ], {
    minDimensions: { width: 400, height: 300 }
  });

  assertNonEmpty(bpmnOutput);
  assertNonEmpty(dmnOutput);
});

test('@AC-1 rejects an unknown output format', { timeout: TIMEOUT }, async function() {

  await assert.rejects(
    () => convertAll([
      { input: BPMN_FIXTURE, outputs: [ join(outDir, 'nope.jpeg') ] }
    ], {
      minDimensions: { width: 400, height: 300 }
    }),
    /unknown output file format/
  );
});

test('@AC-1 picks the viewer from the file extension', function() {
  assert.equal(getMode('diagram.bpmn'), 'bpmn');
  assert.equal(getMode('diagram.BPMN'), 'bpmn');
  assert.equal(getMode('diagram.dmn'), 'dmn');
  assert.equal(getMode('diagram.DMN'), 'dmn');
});
