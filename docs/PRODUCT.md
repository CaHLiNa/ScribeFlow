# Product

## Purpose

This document records the current product definition of Altals.

It describes the product truthfully as it exists today and the direction already chosen in the repository.

## Current Product Definition

Altals is a local-first, project-directory-centered research and academic operating system.

It combines:

- Markdown drafting
- LaTeX and Typst paper authoring
- notebook and terminal-backed computation
- reference management and citation workflows
- build, preview, and diagnostics
- change review, save points, and file history
- optional Git sync
- auditable AI-assisted workflows

## Current Strongest Supported Flow

The strongest landed loop today is still document-heavy:

1. open a local workspace folder
2. navigate between project, library, and AI surfaces from one shell
3. edit Markdown / LaTeX / Typst or related project files
4. build and preview outputs
5. inspect file history or workspace save points
6. optionally ask AI to diagnose or propose a patch for a narrow task

The computation loop is real but more fragmented:

- notebook editing exists
- Jupyter-backed Python / R / Julia kernels are discoverable
- text-editor chunk execution exists for runnable document/code surfaces
- terminal sessions and build logs exist

That means Altals already behaves like a research workspace, but it is not yet equally mature across writing, computation, and AI surfaces.

## First-Class Product Objects

The current refactor should treat these objects as first-class:

- Project
- Document
- Notebook
- Computation
- Reference
- Build
- Change
- Workflow

## Secondary Systems

These still matter, but they are secondary to the core research loop:

- Git sync and remote linking
- generic AI chat surfaces
- experimental panels
- migration shims
- packaging and release automation

If there is tension between those systems and the core project workflow, the core workflow wins.

## Product Clarity Rules

These distinctions must stay explicit:

- autosave is not a snapshot
- a workspace save point is not the same thing as a Git commit
- remote sync is not a local recovery layer
- notebook output is not persisted project state unless explicitly saved
- AI chat is not an approval-free mutation path

## Current Non-Goals

The current refactor is not trying to make Altals into:

- a generic cloud notebook platform
- a generic IDE for every language and workflow
- a Git-first persistence product
- an autonomous AI mutator that edits repositories without review
- a background-sync-heavy system that hides state transitions from the user

## Current Product Risks

The main product risks today are:

- product language in some docs still undersells the real research-compute scope
- notebook/kernel/terminal behavior is present but not yet unified behind one clearer execution domain
- AI launch entry points are still distributed outside one shared app/domain seam
- Git-backed file history and app-managed workspace save points are clearer than before, but still not simple enough to explain at a glance
