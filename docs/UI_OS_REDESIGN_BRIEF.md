# Altals V2 UI/UX Refactor Blueprint (For Codex)

## 1. Project Context & Objectives
You are assisting in a massive frontend refactor for "Altals", a high-performance, Multi-Agent driven Academic Writing IDE (Tauri + Vue 3 + Rust).
The current frontend suffers from Vue reactivity performance bottlenecks and a fragmented, unpolished UI. 

**Our Objective:** Completely overhaul the visual system to achieve a macOS-native, sleek, and highly performant desktop experience, reminiscent of apps like Notion, Obsidian, or Craft. 

## 2. Tech Stack Mandate
You will implement the new UI using the following stack. Do not use legacy UI libraries.
* **Core:** Vue 3 (Composition API, `<script setup>`).
* **Styling:** Tailwind CSS.
* **UI Components:** **Shadcn Vue** (or Radix Vue directly for headless primitives). This is strictly required for accessible, high-quality interactive components (Dropdowns, Popovers, Dialogs, Selects) without writing complex CSS/JS from scratch.
* **Icons:** Lucide Icons (via `lucide-vue-next`).

## 3. CRITICAL Performance Constraints (Read Carefully)
The current app lags because massive objects (ASTs, parsed BibTeX, PDF buffer states) are wrapped in deep Vue reactivity.
* **Rule 3.1: Strict State Isolation:** All heavy data objects (Markdown/Typst AST, document text, large arrays) MUST be wrapped in `shallowRef` or `markRaw`. Never use `reactive` or `ref` for anything other than primitive UI states (booleans, strings, simple counters).
* **Rule 3.2: Virtualization:** Any list exceeding 100 items (e.g., Reference Library, File Tree, long outlines) must use virtual scrolling.
* **Rule 3.3: IPC Debouncing:** Do not spam Tauri IPC calls on every keystroke. Use `lodash/debounce` or custom event bus buffering for Rust backend calls.

## 4. Design Language & Visual Tokens
We are going for a "Quiet, Professional, Academic" aesthetic. Deep integration with macOS visual cues.

* **Colors (Tailwind Variables Strategy):**
  * `background`: Clean white (`#ffffff`) or very dark gray for dark mode (`#0f0f0f`).
  * `surface`: Slightly offset background for sidebars/panels (`#f9fafb` in light, `#171717` in dark).
  * `primary`: A muted, sophisticated accent color (e.g., Zinc or Slate `zinc-900` for light mode, `zinc-100` for dark mode). No overly bright/childish colors.
  * `border`: Subtle borders (`border-border/40`).
* **Typography:**
  * **UI Interface:** Geist or Inter (sans-serif, tracking-tight, text-sm for standard UI elements).
  * **Editor/Academic Content:** Lora or Crimson Text (serif, high legibility).
  * **Code/Terminal:** JetBrains Mono.
* **Layout Geometry:**
  * Implement a standard 3-pane layout: Left Sidebar (File/Library) -> Main Editor -> Right Sidebar (AiWorkbench/Outline).
  * Use `h-screen w-screen overflow-hidden` for the root. Let individual panes handle their own `overflow-y-auto`.
  * Add subtle macOS-like translucency (`backdrop-blur-md bg-background/80`) to floating elements like Command Palettes and floating toolbars.

## 5. Execution Plan (Strangler Fig Strategy)
Do NOT delete the entire `src/components` or `src/editor` folder at once. We will build `src/v2/` alongside the existing app. 

Follow these steps sequentially. Wait for my approval after each step before moving to the next:

* **Step 1: Scaffold V2 Foundation.** Configure Tailwind (`tailwind.config.js`) with CSS variables for Shadcn Vue. Create base layout wrappers in `src/v2/layout/`.
* **Step 2: Headless Base Components.** Implement core Shadcn Vue components (Button, Input, Dialog, Tooltip, ScrollArea) into a `src/v2/components/ui/` folder.
* **Step 3: Sidebar & Navigation Refactor.** Rewrite `LeftSidebar.vue` and `FileTree.vue` using the new V2 components. Ensure the file tree is performant and looks like a native macOS finder sidebar.
* **Step 4: AiWorkbench Panel Refactor.** Rebuild the right-side AI panel (`AiWorkbenchSidebar.vue`). Use clean card layouts for AI artifacts and chat bubbles.
* **Step 5: Editor Wrapper Refactor.** Wrap the existing heavy editors (CodeMirror/ProseMirror/Typst) in the new V2 shell. Ensure the editor takes up the remaining flex space seamlessly.

## 6. Coding Style for AI
* Output full, copy-pasteable files. Do not leave "TODO" comments for me to fill in, unless it requires a Rust backend change.
* Keep `<template>` clean. Extract complex logical conditions into `computed` properties.
* Write robust TypeScript/JSDoc types for component props.