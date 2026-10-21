# Agentic Workflow Toybox

A small demonstration of **a deterministic workflow with agentic steps**: ordinary code controls the sequence, specialized skills do the reasoning, and files carry results between steps.

The goal is to give developers a working example they can read, understand, and build on—not to provide a production workflow engine. The orchestration is intentionally simple: a fixed sequence, a few output guards, hooks for verification feedback, and exported agent trajectories for later inspection.

## What this demonstrates

- Wrapping focused, reusable skills in headless Devin CLI calls.
- Passing one step’s output file into the next step’s input.
- Interleaving agentic work with deterministic validation and scoring.
- Giving agents verification feedback through hooks and skill-specific checks.
- Exporting interaction traces to support auditing and cost review.

The example follows the beginning of a software delivery process: extract a requirement, enrich its analysis, then grade its readiness before allowing further work. The skills were drawn from a larger repository that took a different approach to orchestration. The evaluation examples included here illustrate how to test the individual skills; they are not the complete evaluation history or proof of production readiness.

## Workflow overview

The entire orchestrator lives in [`workflow.js`](workflow.js).

```text
Story document
    |
    v
Validate input exists                         [deterministic]
    |
    v
extract-story-intent -> *.intent.json          [agentic]
    |
    v
analyze-story -> *.analysis.json               [agentic]
    |
    v
 grade-story-analysis -> *.analysis-grade.json [agentic]
    |
    v
Compute weighted score                        [deterministic]
    |
    +-- score >= 80 -> CONTINUE; workflow completes
    |
    +-- score < 80  -> PUNCH_OUT; workflow exits with failure
```

After each agentic call, the wrapper checks the CLI exit status, looks for a file with the expected suffix alongside the input, and verifies that it is non-empty. The selected file becomes the next step’s input. The agent does not choose which workflow step runs next: the `steps` and `nextStep` maps define that sequence in code.

### Skills and their contracts

| Step | Purpose | Output contract | Verification | Evaluation examples |
| --- | --- | --- | --- | --- |
| [`extract-story-intent`](.devin/skills/extract-story-intent/SKILL.md) | Extract the user story, persona, capability breakdown, and acceptance criteria. | [`story-intent.schema.json`](.devin/skills/extract-story-intent/schema/story-intent.schema.json) | [`verify.sh`](.devin/skills/extract-story-intent/verify.sh) | [`_tests/`](.devin/skills/extract-story-intent/_tests/) |
| [`analyze-story`](.devin/skills/analyze-story/SKILL.md) | Enrich the intent with testable criteria, edge cases, dependencies, and open questions. | [`analysis.schema.json`](.devin/skills/analyze-story/schema/analysis.schema.json) | [`verify.sh`](.devin/skills/analyze-story/verify.sh) | [`_tests/`](.devin/skills/analyze-story/_tests/) |
| [`grade-story-analysis`](.devin/skills/grade-story-analysis/SKILL.md) | Assess the analysis against a [quality rubric](.devin/skills/grade-story-analysis/rubric.md), with reasons and improvement recommendations. | [`analysis-grade.schema.json`](.devin/skills/grade-story-analysis/schema/analysis-grade.schema.json) | [`verify.sh`](.devin/skills/grade-story-analysis/verify.sh) | [`_tests/`](.devin/skills/grade-story-analysis/_tests/) |

The final `computeScore` function is plain JavaScript, not another agent call. It checks that all five dimension scores are numeric and between 0 and 3, applies fixed weights, reports recommendations for dimensions scoring 2 or below, and compares the result with the threshold of 80.

**Scoring caveat:** the current weights total 0.95, and the formula divides the weighted sum by 3 before multiplying by 100. A perfect set of grades therefore scores 95, even though the console labels the scale `/ 100`. Treat this as part of the example’s current implementation, not a calibrated readiness measure.

## Run the demo

### Prerequisites

- Node.js to run the orchestrator. It uses only built-in Node modules; there is no package installation step for `workflow.js`.
- An installed, authenticated Devin CLI, available as `devin` on your `PATH`.
- Bash and `jq` for the included hook and skill verification scripts.
- If you edit YAML with the supplied hooks enabled, the YAML syntax hook also expects the `js-yaml` Node module to be available. This repository does not include a dependency manifest to install it.

Run from the repository root so the CLI can use the local skills and hooks:

```sh
node workflow.js docs/example_story.md
```

To select another CLI executable:

```sh
DEVIN_BIN=/path/to/devin node workflow.js docs/example_story.md
```

**Execution permissions:** the wrapper invokes the CLI with `--permission-mode dangerous` and `--respect-workspace-trust false` for unattended execution. This is not a sandbox. **Run the demo only in an environment and with inputs you trust**; review these settings before adapting it to other uses.

The [sample story](docs/example_story.md) is deliberately thin and intended to exercise the failing-grade path. Because analysis and grading are agentic, a particular score or decision is not guaranteed. A below-threshold grade logs `PUNCH_OUT` and exits with status 1; that is an expected demonstration outcome, not necessarily a CLI or file-generation error.

### Outputs and audit artifacts

The skills write their JSON outputs beside the input document. For the sample, inspect `docs/` for files ending in `.intent.json`, `.analysis.json`, and `.analysis-grade.json`.

Each skill is also instructed to create a persistent completion sentinel at `<input-directory>/.process/<skill-name>.done.json`. The sentinel identifies the skill and supplies parameters to its verifier. The wrapper requests an ATIF conversation export at `<input-directory>/.process/<skill-name>.atif.json` for each agentic call.

For the sample, these artifacts belong under `docs/.process/`. Use the JSON outputs, sentinels, console errors, and any exported traces to investigate a run. Exports are requested, but the wrapper does not independently verify that the trace files were written; a failed launch may leave no trace. Trace filenames are fixed per skill rather than unique per run, so archive artifacts separately if you need a run history.

## Guardrails and verification feedback

There are two distinct layers:

1. **Workflow guards:** [`workflow.js`](workflow.js) validates the input, checks CLI completion, requires a matching non-empty output file after each agentic call, and validates the numeric grades before scoring.
2. **Agent-side feedback:** [`.devin/hooks.json`](.devin/hooks.json) connects tool events to verification scripts. When an agent writes a completion sentinel, [`post-edit-verify-skill.sh`](.devin/scripts/post-edit-verify-skill.sh) dispatches to that skill’s `verify.sh`. [`validate-json-yaml.sh`](.devin/scripts/validate-json-yaml.sh) checks JSON/YAML syntax. The configuration also includes secret-related checks.

The skill verifiers perform targeted structural and consistency checks. They are not equivalent to a complete JSON Schema validator, and the orchestrator does not directly invoke them or require a verified sentinel before continuing. Hooks provide feedback within an agent session; they do not add workflow-level retries or recovery.

## Deliberate limits and extension points

This toybox keeps orchestration visible by leaving out machinery a larger system would need:

- **No workflow retries or repair.** A non-zero CLI exit, missing matching output, or empty selected output stops the run. There is no retry budget, backoff, or repair branch.
- **One terminal human handoff signal.** `PUNCH_OUT` is logged only at the final score gate. It does not open a review session, wait for instructions, or support resuming. To respond to decisions from earlier steps, extend `workflow()` to interpret structured signals and route to a human or repair protocol.
- **Basic output discovery.** The wrapper selects the first filename with the expected suffix in the input directory. It does not establish that the file was produced by the current call or belongs to the current story. Use a clean input directory for the demo; production adaptations should use exact artifact paths and run-specific directories.
- **No durable execution state or concurrency controls.** There are no checkpoints, resumable runs, parallel branches, or per-run artifact identities.
- **Limited auditing guarantees.** Trajectory export supports inspection, but there is no enforced retention, trace completeness check, or automated cost reporting.
- **Agentic results remain variable.** A fixed execution sequence does not make the generated content deterministic. Evaluate skills independently, verify artifacts, and calibrate decision thresholds for your own use case.

To experiment, start with `createAgenticWorkflowStep` and `agenticCall` for the agent boundary, `steps` and `nextStep` for routing, and `computeScore` for an ordinary deterministic step. Those are the places to add stronger contracts, intermediate decision gates, or recovery behavior without hiding the orchestration in a larger framework.

## Further Reading

This repo was built on skills extracted from a larger codebase, which provides a more comprehensive demonstration of agentic orchestration. See [this PR](https://github.com/djscheuf/agentic-dev-ecosystem-template/pull/9) for a more detailed implementation.

## License

[MIT](LICENSE).
