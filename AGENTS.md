# AGENTS.md

# Altals Repository Agent Constitution
# Mandatory operating rules for Codex and any coding agent

This file is the repository constitution for agents working in this codebase.

If you are a coding agent, you must read this file fully before doing any work.
Follow it as the highest-priority repository-specific instruction set unless the user explicitly overrides a specific rule in the current task.

This repository is in an active refactor.
Your job is not to preserve current accidental complexity.
Your job is to move the repository toward the target architecture safely, incrementally, and visibly.

---

# 0. Prime Directive

Altals is being refactored from a broad, feature-heavy research desktop application into:

> A local-first, project-directory-centered academic writing workspace.

The product center must be:

1. open a local project
2. browse files
3. edit documents
4. manage references
5. build / preview outputs
6. review changes
7. optionally use AI through auditable patch-based workflows

Everything else is secondary.

If a system, panel, abstraction, automation, or legacy path does not strengthen that flow, it must be:
- reduced
- isolated
- deferred
- or removed

Do not optimize for feature count.
Optimize for clarity, structure, safety, and maintainability.

---

# 1. Non-Negotiable Repository Rules

## 1.1 Never “just keep adding code” to legacy monoliths
Do not continue growing giant central files.

If a file is already large, mixed-responsibility, or centralizing too many concerns, do not add more logic there unless it is a minimal bridge needed for migration.

Preferred strategy:
1. create a new target module
2. move one coherent responsibility
3. reroute usage
4. verify behavior
5. delete the old path later

## 1.2 Never skip the blueprint
Before every meaningful refactor slice, read:
- `AGENTS.md`
- `docs/REFACTOR_BLUEPRINT.md`

If `docs/REFACTOR_BLUEPRINT.md` does not exist, create it before doing other meaningful work.

If it exists, update it before and after meaningful work.

## 1.3 Never treat docs as optional
Docs are part of the refactor.
If code changes but the blueprint and architecture docs become stale, the work is incomplete.

## 1.4 Never prefer hidden automation over explicit safety
Do not reintroduce or strengthen hidden “magic” behavior that reduces user understanding.

Especially forbidden as defaults:
- aggressive background Git commits
- AI direct file mutation
- silent sync behavior acting as persistence
- implicit cross-domain side effects

## 1.5 Never leave the repository in a half-migrated ambiguous state without documenting it
If old and new systems must coexist temporarily, document:
- what is legacy
- what is new
- what has been rerouted
- what still depends on old code
- what should be deleted next

---

# 2. Required Behavior When User Says “Continue”

If the user says any broad instruction such as:
- continue
- keep going
- continue refactoring
- proceed
- move forward
- next phase

you must do this exact sequence:

1. inspect current repository state
2. read `AGENTS.md`
3. read `docs/REFACTOR_BLUEPRINT.md`
4. update `docs/REFACTOR_BLUEPRINT.md` to reflect reality
5. choose the next smallest high-value refactor slice
6. execute that slice
7. validate it
8. update `docs/REFACTOR_BLUEPRINT.md` again if needed
9. summarize:
   - what changed
   - what was validated
   - what remains
   - what the next recommended slice is

Do not wait for the user to specify every file unless the user explicitly wants a narrower scope.

Do not respond with only planning unless the repo is blocked by a real constraint.
Default expectation: update the blueprint and make concrete code progress in the same turn.

---

# 3. Hard Requirement: Maintain the Blueprint

`docs/REFACTOR_BLUEPRINT.md` is mandatory.

It is the live execution plan and must be continuously maintained.

It must always contain these top-level sections:

# Refactor Blueprint
## Overview
## Product Direction
## Architectural Principles
## Current State Assessment
## Phase Plan
## Task Backlog
## In Progress
## Completed
## Blocked / Risks
## Next Recommended Slice
## Validation Checklist
## Migration Notes

You may add subsections, but do not remove these headings.

Whenever you discover architectural facts, migration status, risk, or next-step changes, update the file.

A stale blueprint is considered a repository defect.

---

# 4. Product Scope Rules

Treat the following as first-class product objects:

- Project
- Document
- Reference
- Build
- Change
- Workflow

Treat the following as secondary support systems:

- Git
- remote sync
- terminal
- AI chat
- experimental panels
- migration shims
- legacy fork-era concepts

If there is tension between core writing workflow and a support system, prioritize the writing workflow.

Do not let Git, AI, terminal, or legacy complexity dominate the product structure.

---

# 5. Refactor Priority Order

Unless the user explicitly says otherwise, always prioritize work in this order:

## Priority 1 — product clarity
- clarify current product definition
- remove stale product framing
- remove legacy/upstream identity from active docs
- reduce ambiguity about what Altals is

## Priority 2 — architectural boundaries
- split giant stores
- split giant root components
- split giant command aggregators
- create clear domain modules
- reduce cross-domain leakage

## Priority 3 — project/document/build/change loop
- stabilize open/edit/save/build/review loop
- make diagnostics coherent
- make changes visible and reversible

## Priority 4 — safety model
- separate autosave, snapshot, git commit, remote sync
- reduce hidden behavior
- improve recovery confidence

## Priority 5 — AI workflow discipline
- convert AI features into proposal/patch/review flows
- enforce safe operation boundaries

## Priority 6 — cleanup and stabilization
- remove dead code
- remove stale docs
- add tests
- improve CI
- tighten validation

Do not prioritize feature expansion above these unless the user explicitly instructs it.

---

# 6. Forbidden Shortcuts

The following are prohibited unless the user explicitly instructs otherwise and the change is documented:

## 6.1 No docs-only fake progress
Do not satisfy “continue refactoring” by updating only docs unless:
- the repository is genuinely blocked, or
- the requested work is documentation-specific

Default expectation: docs + code progress together.

## 6.2 No giant blind rewrite
Do not rewrite large subsystems in one uncontrolled move if an incremental migration is feasible.

## 6.3 No permanent dual systems
Do not leave legacy and replacement systems running in parallel indefinitely.
Temporary coexistence is allowed only if:
- it is documented
- the migration path is clear
- deletion targets are identified

## 6.4 No architecture bypass “just to make it work”
Do not add new direct calls, hidden singletons, or cross-layer hacks that bypass emerging domain/service/operation boundaries.

## 6.5 No direct AI mutation path
AI must not directly write files outside the normal application operation path.

## 6.6 No Git-as-autosave
Do not use Git commits as the default silent persistence mechanism.

## 6.7 No stale blueprint
Never finish a meaningful refactor slice without checking whether the blueprint must be updated.

## 6.8 No unchecked large change set
Do not produce broad multi-domain changes without validation notes and clear summary.

---

# 7. Mandatory Architectural Direction

## 7.1 Domain-first code organization
New structure should move toward this pattern.

Frontend target shape:

- `src/app`
- `src/domains/project`
- `src/domains/document`
- `src/domains/reference`
- `src/domains/build`
- `src/domains/changes`
- `src/domains/ai`
- `src/domains/git`
- `src/domains/terminal`
- `src/shared`

Rust target shape:

- `src-tauri/src/commands`
- `src-tauri/src/core`
- `src-tauri/src/services`
- `src-tauri/src/models`
- `src-tauri/src/errors`

Do not keep strengthening a flat, global, mixed-responsibility layout.

## 7.2 Root components must become thinner over time
Root app components should compose.
They should not orchestrate business logic across many domains.

## 7.3 Stores must become narrower over time
Do not maintain or expand a global store that controls the entire application.
Move toward domain stores with explicit boundaries.

## 7.4 Rust commands must become thinner over time
Rust command handlers should:
- validate inputs
- call services/core
- return structured results

They should not become monolithic business containers.

---

# 8. Operation Model Requirement

The codebase should converge toward a shared operation model.

UI actions, AI actions, and command invocations should increasingly route through common operations.

Target examples include:

- OpenProject
- CloseProject
- ListProjectFiles
- ReadDocument
- SaveDocument
- ApplyPatch
- BuildDocument
- BuildProject
- CreateSnapshot
- RestoreSnapshot
- SearchReferences
- InsertCitation
- ListChanges
- CommitChanges
- PushRemote
- PullRemote
- RunAiWorkflow

Do not create a special hidden “AI-only mutation backend” that bypasses normal app operations.

If you introduce new behavior, prefer to express it as an operation or a service call aligned with this direction.

---

# 9. Change Safety Model

The application must clearly separate these four concepts:

1. autosave
2. local snapshot
3. git commit
4. remote sync

These are not the same thing.

## 9.1 Autosave
- frequent
- local
- simple
- not user history
- not git

## 9.2 Local snapshot
- app-level restore point
- safety layer
- should be restorable
- distinct from git history

## 9.3 Git commit
- explicit by default
- milestone-oriented if any automation is retained
- not the default persistence engine

## 9.4 Remote sync
- visible
- stateful
- explicit or clearly controlled
- not a replacement for local safety

Never collapse these concepts back together.

Never reintroduce aggressive auto-commit as the default behavior.

---

# 10. AI Constitution

AI in this repository must be conservative, scoped, auditable, and patch-first.

## 10.1 Allowed AI pattern
Preferred AI flow:

1. gather scoped context
2. generate proposal
3. present patch or diff
4. allow approval/rejection
5. apply through normal operation path
6. create or associate a snapshot when appropriate

## 10.2 Forbidden AI behavior
AI must not, by default:
- directly rewrite files invisibly
- directly commit Git changes
- directly push or pull remotes
- perform broad autonomous repo rewrites without explicit user instruction
- bypass validation or review paths

## 10.3 Preferred early AI workflows
Prefer building and strengthening only a few narrow, reliable workflows:

- rewrite current selection
- explain build errors and propose fixes
- suggest citations for a paragraph/section

Do not expand AI breadth until safety and operation boundaries are established.

## 10.4 AI context scope discipline
Prefer:
- current selection
- current document
- current diagnostics
- current references
- current project metadata

Avoid unconstrained whole-repo mutation context unless explicitly needed.

---

# 11. Documentation Constitution

Documentation must describe the current system, not the historical accident.

## 11.1 Required docs over time
Maintain or create these files as the refactor progresses:

- `docs/PRODUCT.md`
- `docs/ARCHITECTURE.md`
- `docs/DOMAINS.md`
- `docs/OPERATIONS.md`
- `docs/DATA_MODEL.md`
- `docs/BUILD_SYSTEM.md`
- `docs/AI_SYSTEM.md`
- `docs/GIT_AND_SNAPSHOTS.md`
- `docs/REFACTOR_BLUEPRINT.md`
- `docs/CONTRIBUTING.md`
- `docs/TESTING.md`

## 11.2 Legacy docs policy
Move old or misleading docs to:
- `docs/LEGACY/`

Do not leave outdated docs in the main docs path pretending to describe the current architecture.

## 11.3 Terminology cleanup
Remove stale naming, stale product identity, and stale fork/upstream framing from active documentation as part of the refactor.

---

# 12. Migration Method

Use this default migration loop:

## Step 1
Understand current behavior.

## Step 2
Create the target module/path.

## Step 3
Move one coherent responsibility.

## Step 4
Reroute usage.

## Step 5
Validate behavior.

## Step 6
Mark legacy deletion targets.

## Step 7
Delete legacy code when safe.

Do not jump from “old messy system” to “totally new system” in one speculative leap unless the user explicitly requests a rewrite and the blast radius is controlled.

---

# 13. Required Working Output Per Refactor Turn

At the end of each meaningful refactor turn, provide a concise but concrete summary including:

1. what code changed
2. what docs changed
3. whether `docs/REFACTOR_BLUEPRINT.md` was updated
4. what validation was performed
5. what remains partially migrated
6. what the next recommended slice is

If validation was not possible, say exactly why.

If only docs were changed, justify why no code slice was feasible.

---

# 14. Validation Requirements

## 14.1 Minimum expectation
Every meaningful code slice should try to improve one or more of:
- testability
- type safety
- build confidence
- module clarity
- validation coverage

## 14.2 “Compiles” is not enough
Where possible, validate actual behavior.

## 14.3 Prefer smaller validated slices
A smaller verified migration is better than a broader unverified rewrite.

## 14.4 Do not skip validation silently
If you could not run tests/build/verification, explicitly state:
- what was not run
- why
- what remains to verify

---

# 15. Strong Rules Against Laziness

These rules exist because coding agents often try to optimize for speed instead of repository health.

## 15.1 Do not only rename files to simulate progress
Renames without boundary improvement, migration, or simplification do not count as meaningful refactor progress.

## 15.2 Do not produce cosmetic refactors as substitutes for architectural work
Formatting, reordering, and tiny wrapper extraction do not count as progress unless they unblock a meaningful migration slice.

## 15.3 Do not endlessly “prepare” without executing
Planning is necessary, but after updating the blueprint you are expected to make code progress unless blocked.

## 15.4 Do not keep touching the same giant file if the task should create a new boundary
If the right move is extraction, then extract.

## 15.5 Do not claim “future work” instead of leaving concrete migration notes
If a system remains partially migrated, document exact next steps.

---

# 16. Required Biases

When uncertain, prefer:

- clarity over cleverness
- explicitness over magic
- narrow slices over broad rewrites
- deletion over indefinite compatibility clutter
- documented migration over hidden partial rewrites
- safe AI review flows over “smart” direct action
- real boundaries over convenience shortcuts
- repository health over speed theater

---

# 17. What to Preserve

Preserve and build on stable assets where aligned with the target product:

- Tauri desktop shell
- local-first direction
- Rust-backed system access
- stable project/file access pathways
- stable build/render/diagnostic pathways
- secure provider/key handling
- stable auth or sync infrastructure if still aligned with product direction

Preserve useful foundations.
Do not preserve accidental architecture.

---

# 18. What to Remove, Reduce, or Isolate

Be willing to reduce or isolate:

- stale upstream-fork framing
- stale naming
- sprawling experimental UI
- hidden automation
- duplicate surfaces for the same action
- global stores with broad responsibilities
- mixed-responsibility root components
- silent AI side effects
- Git-driven persistence magic
- docs that lie about the current system

---

# 19. When Unsure What To Do Next

If scope is broad and the user has not specified the exact next task, do this:

1. read `docs/REFACTOR_BLUEPRINT.md`
2. pick the item under `Next Recommended Slice`
3. if blocked, choose the highest-value item in `Task Backlog`
4. if blueprint is stale, update it first
5. then execute the smallest coherent refactor slice

Do not stall if the next reasonable action is inferable.

---

# 20. Required Initial Actions In A Fresh Session

At the start of a fresh session in this repository, do this before major edits:

1. read `AGENTS.md`
2. inspect the repo structure
3. read `docs/REFACTOR_BLUEPRINT.md`
4. identify current migration state
5. update the blueprint if it is stale
6. execute the next recommended slice

---

# 21. Subagent Execution Policy

Subagents may be used to accelerate the refactor, but only in a controlled way.

## 21.1 Main coordinator requirement
There must always be one main coordinating agent responsible for:
- reading `AGENTS.md`
- reading and updating `docs/REFACTOR_BLUEPRINT.md`
- deciding the next recommended slice
- deciding which workstreams are safe to parallelize
- integrating subagent results back into one coherent repository state
- reporting final validation and remaining risks

Subagents must not act as independent architects for the whole repository.

## 21.2 When subagents should be used
Use subagents only when there are 2 to 4 reasonably independent workstreams that can proceed in parallel with low merge/conflict risk.

Good candidates for subagents:
- docs cleanup and terminology cleanup
- test-gap audits and validation scaffolding
- targeted domain extraction planning
- isolated store/module splits
- dead code and legacy path audits

## 21.3 When subagents should not be used
Do not use subagents to blindly parallelize all remaining phases.

Do not split tightly coupled work across multiple subagents when it requires shared architectural decisions.

Especially avoid blind parallelization for:
- final operation model decisions
- root app integration
- autosave/snapshot/git/sync safety model integration
- AI proposal/patch/review main-path integration
- broad cross-domain rewrites

## 21.4 Parallelize by workstream, not by phase
Do not assign one subagent per remaining phase by default.

Instead, parallelize only by independent workstreams that can be merged safely.

## 21.5 Model and effort guidance
Do not default all subagents to the highest-cost or slowest reasoning mode.

Use stronger models / higher effort only for difficult architectural or refactor tasks.
Use faster or automatically selected models for lighter audits, docs cleanup, naming cleanup, and test-gap analysis.

## 21.6 Integration requirement
Before starting subagent work:
1. update `docs/REFACTOR_BLUEPRINT.md`
2. identify the independent workstreams
3. define expected outputs for each subagent

After subagent work:
1. integrate results into one coherent state
2. resolve conflicts and duplication
3. update `docs/REFACTOR_BLUEPRINT.md` again
4. report what was completed, what was validated, and what remains blocked

## 21.7 Anti-pattern
Do not use subagents as a substitute for architectural judgment.

If subagents are used, the repository must still become more coherent, not less.

---

# 22. Definition of Failure

A refactor turn is considered poor or failed if it does any of the following:

- updates docs only without good reason
- adds more logic to a known monolith instead of extracting a boundary
- leaves `docs/REFACTOR_BLUEPRINT.md` stale
- expands hidden automation
- uses Git as silent persistence
- lets AI mutate files outside reviewable paths
- keeps dual systems without documenting deletion targets
- makes broad unvalidated changes with unclear outcomes
- claims progress without concrete migration effect

---

# 23. Definition of Success

A refactor turn is successful when the repository becomes measurably more like this:

- easier to explain in one sentence
- clearer main workflow
- thinner root components
- narrower stores
- clearer domain boundaries
- safer and more visible changes
- clearer separation of autosave, snapshots, git, and sync
- AI is more patch-first and auditable
- docs increasingly match reality
- next refactor steps become more obvious, not less

---

# 24. Final Order

If you are an agent and you are unsure whether to optimize for speed or repository quality:

optimize for repository quality

If you are unsure whether to preserve old complexity or create clearer structure:

create clearer structure

If you are unsure whether to make hidden automation smarter or make behavior more explicit:

make behavior more explicit

If you are unsure whether to stop after planning or continue into implementation:

continue into implementation unless truly blocked

# 25. Continuous Execution Requirement

When the user asks to continue refactoring, do not stop after a single slice unless one of the following is true:
- there is a real blocker requiring human judgment
- validation fails and requires human input
- the current phase is fully completed

Otherwise, continue in repeated execution cycles.

For each cycle:
1. read `docs/REFACTOR_BLUEPRINT.md`
2. update it to reflect the current repo state
3. choose the next recommended slice
4. implement one coherent slice with real code changes
5. run relevant validation
6. update `docs/REFACTOR_BLUEPRINT.md` again
7. continue to the next slice

Do not stop after docs-only edits unless truly blocked.
Do not stop after planning.
Do not stop after one slice if more safe slices remain in the current phase.

# 26. Subagent Policy

Do not use subagents by default.

Prefer a single main agent working through repeated, narrow, validated refactor slices.

Only use subagents if the user explicitly requests them for a specific task.

Do not introduce subagents if they would increase coordination overhead, slow down execution, or fragment architectural judgment.