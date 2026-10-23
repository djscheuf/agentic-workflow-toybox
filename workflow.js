#!/usr/bin/env node
/**
 * workflow.js — a minimal setup → agentic call → results pipeline.
 *
 * Usage: node workflow.js <input-file>
 *
 * 1. Setup:    verifies the input file exists.
 * 2. Agentic:  wraps a headless call to the Devin CLI (`devin -p`), asking it
 *              to process the input and write an output file.
 * 3. Results:  confirms the agentic step exited cleanly and the output file
 *              was actually written.
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const DEVIN_BIN = process.env.DEVIN_BIN || 'devin';

function fail(stage, message) {
  console.error(`[${stage}] ERROR: ${message}`);
  process.exit(1);
}

function setupValidation(inputFile){
if (!inputFile) {
  console.error('Usage: node workflow.js <input-file>');
  process.exit(1);
}

const inputPath = path.resolve(inputFile);
if (!fs.existsSync(inputPath)) {
  fail('setup', `input file not found: ${inputPath}`);
}
if (!fs.statSync(inputPath).isFile()) {
  fail('setup', `input path is not a file: ${inputPath}`);
}

const outputPath = inputPath.replace(/(\.[^.]*)?$/, '.out$1');
console.log(`[setup] input file verified: ${inputPath}`);
console.log(`[setup] expected output file: ${outputPath}`);

return { inputPath, outputPath };
}


// Map of output file name -> mtime for every file of the given type in a folder.
const outputMtimes = (dir, fileType) => new Map(
  fs.readdirSync(dir)
    .filter(file => file.endsWith(`.${fileType}`))
    .map(file => [file, fs.statSync(path.join(dir, file)).mtimeMs]),
);

function agenticCall(skillName, inputPath, expectedOutputFileType){
  const prompt = [
    `invoke /${skillName} on ${inputPath}.`,
    'Regenerate the output even if a file or completion sentinel already exists at the target path; do not reuse earlier outputs.',
  ].join(' ');

  const inputFolder = path.dirname(inputPath);
  const tracePath = path.join(inputFolder,".process/", `${skillName}.atif.json`);
  console.log('[agent] invoking devin-cli (headless)...');
  console.log(`[agent] ATIF trace will be exported to: ${tracePath}`);

  const mtimesBefore = outputMtimes(inputFolder, expectedOutputFileType);

  const result = spawnSync(
    DEVIN_BIN,
    [
      '-p', prompt,
      '--permission-mode', 'dangerous',          // allow the agent to write the file
      '--respect-workspace-trust', 'false',   // required for non-interactive runs
      '--export', tracePath,                  // export conversation trace (ATIF format)
    ],
    { stdio: 'inherit', cwd: path.dirname('.') },
  );

  if (result.error) {
    fail('agent', `failed to launch devin-cli: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail('agent', `devin-cli exited with status ${result.status}`);
  }

  console.log('[agent] devin-cli completed successfully');

  // Pick the output this run wrote (new or modified since before the call), not a stale file from an earlier run.
  const mtimesAfter = outputMtimes(inputFolder, expectedOutputFileType);
  const written = [...mtimesAfter].filter(([file, mtime]) => mtimesBefore.get(file) !== mtime);

  if (written.length === 0) {
    fail('agent', `no .${expectedOutputFileType} file was written in ${inputFolder} during this run`);
  }

  const [newestFile] = written.sort((a, b) => b[1] - a[1])[0];
  const foundOutputPath = path.join(inputFolder, newestFile);
  console.log(`[agent] found output file: ${foundOutputPath}`);

  return foundOutputPath;
}

function verify(outputPath){
  if (!fs.existsSync(outputPath)) {
    fail('results', `expected output file was not created: ${outputPath}`);
    return false;
  }
  const stats = fs.statSync(outputPath);
  if (stats.size === 0) {
    fail('results', `output file exists but is empty: ${outputPath}`);
    return false;
  }
  console.log(`[results] output file written: ${outputPath} (${stats.size} bytes)`);

  return true;
}

const GRADE_DIMENSIONS = {
  business_value: 0.25,
  scope: 0.20,
  acceptance_criteria: 0.25,
  story_format: 0.15,
  dependencies: 0.10,
};
const SCORE_THRESHOLD = 80;
// Distinct from 1 (error) so callers can tell "story needs work" from "pipeline broke".
const PUNCH_OUT_EXIT_CODE = 2;

const computeScore = (gradeFilePath) => {
  const grade = JSON.parse(fs.readFileSync(gradeFilePath, 'utf8'));

  for (const dim of Object.keys(GRADE_DIMENSIONS)) {
    const d = grade[dim];
    if (!d || typeof d.score !== 'number' || d.score < 0 || d.score > 3) {
      fail('score', `dimension '${dim}' missing or has invalid score in ${gradeFilePath}`);
    }
  }

  let weighted = 0;
  for (const [dim, weight] of Object.entries(GRADE_DIMENSIONS)) {
    weighted += grade[dim].score * weight;
  }
  // Round to two decimals, matching the printed score, so float noise (e.g. 79.99999999999999) cannot flip the gate.
  const normalized = Math.round((weighted / 3) * 100 * 100) / 100;

  console.log(`[score] Overall Score: ${normalized.toFixed(2)} / 100`);

  for (const dim of Object.keys(GRADE_DIMENSIONS)) {
    const d = grade[dim];
    if (d.score <= 2) {
      console.log(`[score] warning: ${dim} (score: ${d.score})`);
      console.log(`        Reason: ${d.reason}`);
      console.log(`        Recommendation: ${d.recommendation}`);
    }
  }

  const passed = normalized >= SCORE_THRESHOLD;
  const decision = passed ? 'CONTINUE' : 'PUNCH_OUT';
  console.log(`[score] decision: ${decision} (threshold: ${SCORE_THRESHOLD})`);

  return {
    success: passed,
    score: normalized,
    gate: passed ? null : 'PUNCH_OUT',
    output: gradeFilePath,
  };
};

const createAgenticWorkflowStep = (stepName, expectedOutputFileType) => (inputPath) => {
  const outputPath = agenticCall(stepName, inputPath, expectedOutputFileType);
  return {success: verify(outputPath), outputPath};
};

const nextStep = {
  'extract-story-intent': 'analyze-story',
  'analyze-story': 'grade-story-analysis',
  'grade-story-analysis': 'score',
  'score': null,
};

const steps = {
  'extract-story-intent': createAgenticWorkflowStep('extract-story-intent', 'intent.json'),
  'analyze-story': createAgenticWorkflowStep('analyze-story', 'analysis.json'),
  'grade-story-analysis': createAgenticWorkflowStep('grade-story-analysis', 'analysis-grade.json'),
  'score': computeScore,
};

function workflow(inputPath){
  const { outputPath } = setupValidation(inputPath);

  let currentInputPath = inputPath;
  let currentStep = 'extract-story-intent';

  while(currentStep !== null){
    const result = steps[currentStep](currentInputPath);
    if (result.gate === 'PUNCH_OUT') {
      // A low score is a decision, not a failure: the story needs revision.
      console.log(`[workflow] stopped at score gate: ${result.score.toFixed(2)} is below the ${SCORE_THRESHOLD} threshold.`);
      console.log(`[workflow] revise the story using the recommendations above, then rerun: node workflow.js ${inputPath}`);
      process.exit(PUNCH_OUT_EXIT_CODE);
    }
    if(!result.success){
      fail('workflow', `step ${currentStep} failed`);
      break;
    }
    currentInputPath = result.outputPath;
    currentStep = nextStep[currentStep];
  }
  console.log('[results] workflow completed successfully.');
}

workflow(process.argv[2]);
