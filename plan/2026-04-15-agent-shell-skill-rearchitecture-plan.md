# Agent Shell + Filesystem Skills Re-architecture Plan

**Goal:** Re-orient Altals AI from a small set of built-in research actions to an agent-shell architecture closer to Claudian, Codex, and Goose: provider-backed chat runtime, extension/tool layer, and filesystem-native skills that can be discovered from user and project directories.

**Why this change:** The current AI slice is useful as a grounded workbench helper, but it encodes “skills” as product-owned actions. That is the wrong abstraction for the direction the product now needs. In the new model, skills should be durable instruction packs on disk, tools should provide capability, and academic workflows should become first-party skill packs built on top of the shell.

**Reference direction:**
- Claudian: provider-neutral runtime + provider workspace registry + slash/skill shell
- Codex: filesystem skills from `.codex/skills/` and `.agents/skills/`
- Goose: skills as `SKILL.md` directories, MCP/extensions as capability layer, context files as separate layer

---

## Target Architecture

### Layer 1: Agent shell

The right-side AI surface should evolve into a compact agent shell:

- active provider selection
- session transcript
- inline prompt box
- shell actions such as grounded chat or context refresh
- discovered filesystem skills
- future slash, mention, and approval affordances

This shell remains embedded in the Altals workbench rather than becoming a detached full-screen app.

### Layer 2: Provider runtime

Provider configuration remains multi-provider, but the conceptual boundary changes:

- providers are runtime adaptors
- model routing belongs to provider/runtime config
- provider-specific capability differences can be surfaced later

### Layer 3: Extensions and tools

Tools and extensions provide capability. Examples for Altals:

- active document access
- editor selection access
- reference selection access
- document patch application
- draft file creation
- filesystem read/write
- future PDF reader, citation, compile, and MCP-backed services

Skills should describe how to use those capabilities, not replace them.

### Layer 4: Filesystem skills

Altals should discover Codex/Goose-style skills from common paths:

- user-level: `~/.claude/skills/`, `~/.codex/skills/`, `~/.config/agents/skills/`, `~/.config/goose/skills/`
- workspace-level: `./.claude/skills/`, `./.codex/skills/`, `./.goose/skills/`, `./.agents/skills/`, `./.altals/skills/`

Each skill is a directory containing `SKILL.md` and optional support files.

### Layer 5: Research context

Academic context remains a separate layer:

- active document
- selected passage
- selected references
- future PDF selection and compile diagnostics
- future project memory / AGENTS / hints files

This context grounds both shell chat and filesystem skills.

---

## First implementation slice

### Included

- filesystem skill discovery service
- support for common Codex/Goose/Claude skill directories
- skill metadata parsing from `SKILL.md`
- AI panel split between built-in shell actions and discovered filesystem skills
- executor support for running discovered filesystem skills as generic instruction packs
- targeted tests for skill parsing and config precedence

### Not included yet

- full slash-command UX
- mention UX
- MCP extension management UI
- subagents
- runtime-specific skill invocation shortcuts
- recursive support-file hydration beyond `SKILL.md`
- academic first-party skill pack migration

---

## Implementation tasks

### Task 1: Replace the old skill mental model

- keep built-in research helpers as shell actions, not “the” skill system
- move filesystem skill discovery into a separate service
- allow the active AI entry to be either a built-in shell action or a discovered skill

### Task 2: Add filesystem skill discovery

- scan common global and workspace skill roots
- read `SKILL.md`
- parse frontmatter `name` and `description`
- apply deterministic precedence when duplicate skill names exist
- expose scope, path, and supporting-file names

### Task 3: Update panel structure

- keep provider status and grounded context
- add a filesystem skills section
- make the built-in section explicitly “shell actions”
- keep the session transcript and run box

### Task 4: Make executor generic enough for filesystem skills

- built-in shell actions keep structured contracts and artifact normalization
- discovered filesystem skills run through a generic instruction-pack prompt path
- non-structured responses fall back to advisory artifacts

### Task 5: Prepare follow-up slices

- migrate first-party academic workflows into real skills on disk
- add slash invocation and Summon-style “use skill X” affordances
- expose tools/extensions more explicitly

---

## Expected outcome after this slice

After this slice, Altals AI will no longer be architected purely as a hard-coded “AI workflow action panel”. It will become the start of an embedded agent shell with:

- provider-backed runtime selection
- grounded workbench context
- Codex/Goose-style filesystem skill discovery
- a clean separation between shell actions, skills, and tools

That is the right base for later academic packs, MCP integrations, and richer agent behavior.
