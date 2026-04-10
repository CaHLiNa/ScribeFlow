import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  buildClaudePlanAuditPrompt,
  buildCodexReviewPrompt,
  resolveCodexCompanionScript,
  resolvePlanPath,
  resolveShellExport,
} from '../scripts/agentReviewWorkflow.mjs'

test('resolvePlanPath prefers an explicitly provided plan path', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'altals-plan-explicit-'))
  const explicitPlan = path.join(workspaceRoot, 'docs', 'plan', 'explicit.md')
  fs.mkdirSync(path.dirname(explicitPlan), { recursive: true })
  fs.writeFileSync(explicitPlan, '# explicit\n')

  const resolved = resolvePlanPath(workspaceRoot, 'docs/plan/explicit.md')
  assert.equal(resolved, explicitPlan)
})

test('resolvePlanPath falls back to the newest markdown plan file', async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'altals-plan-latest-'))
  const olderPlan = path.join(workspaceRoot, 'docs', 'plan', 'older.md')
  const newerPlan = path.join(workspaceRoot, 'docs', 'superpowers', 'plans', 'newer.md')
  fs.mkdirSync(path.dirname(olderPlan), { recursive: true })
  fs.mkdirSync(path.dirname(newerPlan), { recursive: true })
  fs.writeFileSync(olderPlan, '# older\n')
  await new Promise((resolve) => setTimeout(resolve, 15))
  fs.writeFileSync(newerPlan, '# newer\n')

  const resolved = resolvePlanPath(workspaceRoot)
  assert.equal(resolved, newerPlan)
})

test('resolveCodexCompanionScript picks the newest installed plugin version', () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'altals-codex-plugin-'))
  const versionsDir = path.join(homeDir, '.claude', 'plugins', 'cache', 'openai-codex', 'codex')
  const olderScript = path.join(versionsDir, '1.0.3', 'scripts', 'codex-companion.mjs')
  const newerScript = path.join(versionsDir, '1.0.12', 'scripts', 'codex-companion.mjs')
  fs.mkdirSync(path.dirname(olderScript), { recursive: true })
  fs.mkdirSync(path.dirname(newerScript), { recursive: true })
  fs.writeFileSync(olderScript, '// older\n')
  fs.writeFileSync(newerScript, '// newer\n')

  const resolved = resolveCodexCompanionScript(homeDir)
  assert.equal(resolved, newerScript)
})

test('resolveShellExport falls back to ~/.zshrc when the env var is absent', () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'altals-shell-export-'))
  fs.writeFileSync(
    path.join(homeDir, '.zshrc'),
    'export ANTHROPIC_BASE_URL="http://127.0.0.1:8317/api/provider/anthropic"\n',
  )

  const resolved = resolveShellExport(homeDir, 'ANTHROPIC_BASE_URL', {})
  assert.equal(resolved, 'http://127.0.0.1:8317/api/provider/anthropic')
})

test('audit prompts carry the repo-relative plan path and evidence expectations', () => {
  const workspaceRoot = '/tmp/altals-workspace'
  const planPath = path.join(workspaceRoot, 'docs', 'plan', 'alpha.md')

  const codexPrompt = buildCodexReviewPrompt(planPath, workspaceRoot)
  assert.match(codexPrompt, /docs\/plan\/alpha\.md/)

  const claudePrompt = buildClaudePlanAuditPrompt(planPath, 'main', workspaceRoot)
  assert.match(claudePrompt, /Completed:/)
  assert.match(claudePrompt, /docs\/plan\/alpha\.md/)
  assert.match(claudePrompt, /Do not edit files\./)
})
