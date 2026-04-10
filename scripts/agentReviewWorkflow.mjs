import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { compareSemver } from './version-utils.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const DEFAULT_BASE_BRANCH = 'main'

function parseSemver(version) {
  return /^\d+\.\d+\.\d+$/.test(version) ? version : null
}

function collectMarkdownFiles(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return []
  }

  const matches = []
  const stack = [rootDir]
  while (stack.length > 0) {
    const currentDir = stack.pop()
    const entries = fs.readdirSync(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        stack.push(absolutePath)
        continue
      }
      if (entry.isFile() && /\.md$/i.test(entry.name)) {
        const stat = fs.statSync(absolutePath)
        matches.push({ absolutePath, mtimeMs: stat.mtimeMs })
      }
    }
  }

  return matches
}

export function resolveShellExport(homeDir, name, env = process.env) {
  const envValue = env[name]
  if (typeof envValue === 'string' && envValue.trim()) {
    return envValue.trim()
  }

  const zshrcPath = path.join(homeDir, '.zshrc')
  if (!fs.existsSync(zshrcPath)) {
    return null
  }

  const content = fs.readFileSync(zshrcPath, 'utf8')
  const patterns = [
    new RegExp(`^export ${name}="([^"\\n]+)"$`, 'm'),
    new RegExp(`^export ${name}='([^'\\n]+)'$`, 'm'),
    new RegExp(`^export ${name}=([^\\s#]+)$`, 'm'),
  ]

  for (const pattern of patterns) {
    const match = content.match(pattern)
    if (match?.[1]) {
      return match[1].trim()
    }
  }

  return null
}

export function resolvePlanPath(cwd, explicitPlanPath = null) {
  if (explicitPlanPath) {
    const absolutePath = path.resolve(cwd, explicitPlanPath)
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Plan file not found: ${absolutePath}`)
    }
    return absolutePath
  }

  const directCandidates = [
    'PLAN.md',
    'docs/PLAN.md',
    'docs/plan/current.md',
    'docs/plan/latest.md',
  ]

  for (const relativePath of directCandidates) {
    const absolutePath = path.resolve(cwd, relativePath)
    if (fs.existsSync(absolutePath)) {
      return absolutePath
    }
  }

  const recursiveCandidates = [
    path.resolve(cwd, 'docs', 'plan'),
    path.resolve(cwd, 'docs', 'superpowers', 'plans'),
  ]
    .flatMap((directory) => collectMarkdownFiles(directory))
    .sort((left, right) => right.mtimeMs - left.mtimeMs)

  return recursiveCandidates[0]?.absolutePath ?? null
}

export function resolveCodexCompanionScript(homeDir = os.homedir()) {
  const versionsDir = path.join(homeDir, '.claude', 'plugins', 'cache', 'openai-codex', 'codex')
  if (!fs.existsSync(versionsDir)) {
    return null
  }

  const versions = fs.readdirSync(versionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((version) => parseSemver(version))
    .sort((left, right) => compareSemver(right, left))

  for (const version of versions) {
    const candidate = path.join(versionsDir, version, 'scripts', 'codex-companion.mjs')
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  return null
}

export function buildCodexReviewPrompt(planPath, cwd = repoRoot) {
  const instructions = [
    'Review for correctness, behavioural regressions, risky assumptions, and missing tests.',
  ]

  if (planPath) {
    instructions.push(`Also check whether the implementation still matches the plan in ${path.relative(cwd, planPath)}.`)
  }

  return instructions.join(' ')
}

export function buildClaudePlanAuditPrompt(planPath, baseBranch, cwd = repoRoot) {
  const relativePlanPath = path.relative(cwd, planPath)
  return [
    'Audit implementation progress against the repository plan.',
    `Plan file: ${relativePlanPath}`,
    `Base branch: ${baseBranch}`,
    '',
    'Tasks:',
    `1. Read ${relativePlanPath}.`,
    `2. Inspect git status and git diff against ${baseBranch}.`,
    '3. Determine which planned items are completed, still pending, or have deviated from the plan.',
    '4. Call out behavioural risks, missing tests, and missing verification.',
    '',
    'Return exactly these sections:',
    'Completed:',
    'Pending:',
    'Deviations:',
    'Risks:',
    'Verification:',
    'Next step:',
    '',
    'Rules:',
    '- Use evidence only from the plan, repository files, git state, and test artifacts.',
    '- If an item is not evidenced, keep it pending or unverified.',
    '- Do not edit files.',
  ].join('\n')
}

function captureCommand(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.error || result.status !== 0) {
    return null
  }
  return result.stdout.trim()
}

function buildPlanAuditPayload(cwd, planPath, baseBranch) {
  const relativePlanPath = path.relative(cwd, planPath)
  const planContent = fs.readFileSync(planPath, 'utf8').trim()
  const branchDiffTarget = `${baseBranch}...HEAD`

  const gitStatus = captureCommand('git', ['status', '--short'], cwd) || '(clean)'
  const branchDiffStat = captureCommand('git', ['diff', '--stat', branchDiffTarget], cwd) || '(no branch diff)'
  const branchDiffNames = captureCommand('git', ['diff', '--name-only', branchDiffTarget], cwd) || '(no branch diff)'
  const worktreeDiffStat = captureCommand('git', ['diff', '--stat'], cwd) || '(no unstaged diff)'
  const stagedDiffStat = captureCommand('git', ['diff', '--staged', '--stat'], cwd) || '(no staged diff)'

  return [
    `Plan file: ${relativePlanPath}`,
    `Base branch: ${baseBranch}`,
    '',
    'Plan content:',
    planContent,
    '',
    'Git status:',
    gitStatus,
    '',
    `Branch diff stat (${branchDiffTarget}):`,
    branchDiffStat,
    '',
    `Branch diff files (${branchDiffTarget}):`,
    branchDiffNames,
    '',
    'Staged diff stat:',
    stagedDiffStat,
    '',
    'Worktree diff stat:',
    worktreeDiffStat,
  ].join('\n')
}

function parseArgs(argv) {
  const result = { _: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--') {
      result._.push(...argv.slice(index + 1))
      break
    }
    if (token.startsWith('--')) {
      const key = token.slice(2)
      if (['base', 'plan', 'cwd', 'title', 'scope', 'model'].includes(key)) {
        const value = argv[index + 1]
        if (!value) {
          throw new Error(`Missing value for --${key}`)
        }
        result[key] = value
        index += 1
        continue
      }
      if (['uncommitted', 'wait', 'background'].includes(key)) {
        result[key] = true
        continue
      }
      throw new Error(`Unsupported option: ${token}`)
    }
    result._.push(token)
  }
  return result
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: { ...process.env, ...(options.env ?? {}) },
    stdio: options.stdio ?? 'inherit',
    encoding: options.encoding ?? 'utf8',
  })

  if (result.error) {
    throw result.error
  }

  return result
}

function ensureSuccessfulExit(result, fallbackMessage) {
  if (result.status !== 0) {
    throw new Error(fallbackMessage || `Command failed with exit code ${result.status ?? 'unknown'}`)
  }
}

function runEnableCodexGate(options) {
  const cwd = path.resolve(options.cwd || repoRoot)
  const scriptPath = resolveCodexCompanionScript()
  if (!scriptPath) {
    throw new Error('OpenAI codex-plugin-cc is not installed in Claude Code. Install it first, then rerun this command.')
  }

  const result = runCommand('node', [scriptPath, 'setup', '--enable-review-gate', '--json', '--cwd', cwd], {
    cwd,
    stdio: 'pipe',
  })
  ensureSuccessfulExit(result, result.stderr || result.stdout)

  const report = JSON.parse(result.stdout)
  if (!report.ready) {
    throw new Error(`Codex review gate setup is not ready.\n${result.stdout}`)
  }

  console.log(`Codex review gate enabled for ${cwd}`)
}

function runCodexReview(options) {
  const cwd = path.resolve(options.cwd || repoRoot)
  const scriptPath = resolveCodexCompanionScript()
  if (!scriptPath) {
    throw new Error('OpenAI codex-plugin-cc is not installed in Claude Code. Install it first, then rerun this command.')
  }

  const reviewPrompt = options._.length > 0 ? options._.join(' ').trim() : ''
  const command = reviewPrompt ? 'adversarial-review' : 'review'
  const args = [scriptPath, command]

  if (options.wait) {
    args.push('--wait')
  }
  if (options.background) {
    args.push('--background')
  }
  if (options.uncommitted) {
    args.push('--scope', 'working-tree')
  } else if (options.scope) {
    args.push('--scope', options.scope)
  } else {
    args.push('--base', options.base || DEFAULT_BASE_BRANCH)
  }
  if (reviewPrompt) {
    args.push(reviewPrompt)
  }

  const result = runCommand('node', args, { cwd })
  ensureSuccessfulExit(result)
}

function runClaudePlanAudit(options) {
  const cwd = path.resolve(options.cwd || repoRoot)
  const planPath = resolvePlanPath(cwd, options.plan || null)
  if (!planPath) {
    throw new Error('No plan file found. Pass one explicitly with --plan <path>.')
  }

  const baseBranch = options.base || DEFAULT_BASE_BRANCH
  const prompt = [
    buildClaudePlanAuditPrompt(planPath, baseBranch, cwd),
    '',
    buildPlanAuditPayload(cwd, planPath, baseBranch),
  ].join('\n')
  const homeDir = os.homedir()
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json')
  if (!fs.existsSync(settingsPath)) {
    throw new Error(`Claude settings file not found: ${settingsPath}`)
  }
  const anthropicBaseUrl = resolveShellExport(homeDir, 'ANTHROPIC_BASE_URL')
  if (!anthropicBaseUrl) {
    throw new Error('ANTHROPIC_BASE_URL is not configured in the environment or ~/.zshrc.')
  }

  const args = [
    '-p',
    '--bare',
    '--settings', settingsPath,
    '--effort', 'low',
    '--tools', '',
    '--',
    prompt,
  ]

  const result = runCommand('claude', args, {
    cwd,
    env: {
      ANTHROPIC_BASE_URL: anthropicBaseUrl,
    },
  })
  ensureSuccessfulExit(result)
}

function runCli() {
  const [command, ...rest] = process.argv.slice(2)
  const options = parseArgs(rest)

  if (command === 'enable-codex-gate') {
    runEnableCodexGate(options)
    return
  }

  if (command === 'codex-review') {
    runCodexReview(options)
    return
  }

  if (command === 'claude-plan-audit') {
    runClaudePlanAudit(options)
    return
  }

  throw new Error(
    'Usage: node scripts/agentReviewWorkflow.mjs <enable-codex-gate|codex-review|claude-plan-audit> [options]'
  )
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === __filename
if (isMainModule) {
  try {
    runCli()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
