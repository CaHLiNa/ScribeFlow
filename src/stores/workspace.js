import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { gitInit, gitAdd, gitCommit, gitStatus, gitRemoteGetUrl } from '../services/git'
import {
  getDefaultModelsConfig,
  getProviderDefaultUrl,
  mergeRemoteModelsIntoConfig,
  mergeWithDefaultModelsConfig,
  providerSupportsModelSync,
} from '../services/modelCatalog'
import DEFAULT_SKILL_CONTENT from './defaultSkillContent.js'
import { DEFAULT_PROJECT_INSTRUCTIONS } from '../constants/instructionsTemplate.js'

const DEFAULT_INSTRUCTIONS_TEMPLATE = DEFAULT_PROJECT_INSTRUCTIONS.replace(/\r\n/g, '\n').trim()

async function hashWorkspacePath(value = '') {
  const bytes = new TextEncoder().encode(String(value || ''))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

function resolveWorkspaceDataDir(globalConfigDir = '', workspaceId = '') {
  if (!globalConfigDir || !workspaceId) return ''
  return `${globalConfigDir}/workspaces/${workspaceId}`
}

function resolveClaudeConfigDir(globalConfigDir = '') {
  const normalized = String(globalConfigDir || '').replace(/\/+$/, '')
  const idx = normalized.lastIndexOf('/')
  if (idx < 0) return ''
  return `${normalized.slice(0, idx)}/.claude`
}

function resolveSkillPath(projectDir = '', rawPath = '') {
  const value = String(rawPath || '').trim()
  if (!projectDir || !value) return value
  if (value.startsWith('/')) return value
  if (value.startsWith('.project/')) return `${projectDir}/${value.slice('.project/'.length)}`
  return `${projectDir}/${value.replace(/^\.\//, '')}`
}

function normalizeFileContent(value = '') {
  return String(value).replace(/\r\n/g, '\n')
}

function stripInstructionComments(raw = '') {
  return normalizeFileContent(raw).split('\n')
    .filter(line => !(line.trim().startsWith('<!--') && line.trim().endsWith('-->')))
    .join('\n')
    .trim()
}

function isDefaultInstructionsTemplate(raw = '') {
  return normalizeFileContent(raw).trim() === DEFAULT_INSTRUCTIONS_TEMPLATE
}

export const useWorkspaceStore = defineStore('workspace', {
  state: () => ({
    path: null,
    settings: {},
    systemPrompt: '',
    instructions: '',
    apiKey: '',
    apiKeys: {},
    modelsConfig: null,
    gitAutoCommitInterval: 5 * 60 * 1000, // 5 minutes
    gitAutoCommitTimer: null,
    settingsOpen: false,
    settingsSection: null,
    leftSidebarOpen: localStorage.getItem('leftSidebarOpen') !== 'false',
    rightSidebarOpen: localStorage.getItem('rightSidebarOpen') === 'true',
    bottomPanelOpen: localStorage.getItem('bottomPanelOpen') === 'true',
    leftSidebarWidth: parseInt(localStorage.getItem('leftSidebarWidth')) || 240,
    rightSidebarWidth: parseInt(localStorage.getItem('rightSidebarWidth')) || 360,
    bottomPanelHeight: parseInt(localStorage.getItem('bottomPanelHeight')) || 250,
    disabledTools: [],
    selectedModelId: localStorage.getItem('lastModelId') || '',
    ghostModelId: localStorage.getItem('ghostModelId') || '',
    ghostEnabled: localStorage.getItem('ghostEnabled') !== 'false',
    livePreviewEnabled: localStorage.getItem('livePreviewEnabled') !== 'false',
    softWrap: localStorage.getItem('softWrap') !== 'false',
    wrapColumn: parseInt(localStorage.getItem('wrapColumn')) || 0,
    spellcheck: localStorage.getItem('spellcheck') !== 'false',
    editorFontSize: parseInt(localStorage.getItem('editorFontSize')) || 14,
    uiFontSize: parseInt(localStorage.getItem('uiFontSize')) || 13,
    proseFont: localStorage.getItem('proseFont') || 'inter',
    docxZoomPercent: parseInt(localStorage.getItem('docxZoomPercent')) || 100,
    theme: localStorage.getItem('theme') || 'default',
    referencesPanelHeight: parseInt(localStorage.getItem('referencesPanelHeight')) || 250,
    globalConfigDir: '',
    workspaceId: '',
    workspaceDataDir: '',
    claudeConfigDir: '',
    // GitHub sync
    githubToken: null,   // { token, login, name, email, id, avatarUrl }
    githubUser: null,
    syncStatus: 'disconnected', // idle | syncing | synced | error | conflict | disconnected
    syncError: null,
    syncErrorType: null, // auth | network | conflict | generic
    syncConflictBranch: null,
    lastSyncTime: null,
    remoteUrl: '',
    syncTimer: null,
    // Skills
    skillsManifest: null,  // Array<{ name, description, path }> | null
  }),

  getters: {
    isOpen: (state) => !!state.path,
    altalsDir: (state) => state.workspaceDataDir || null,
    shouldersDir: (state) => state.workspaceDataDir || null,
    projectDir: (state) => state.workspaceDataDir ? `${state.workspaceDataDir}/project` : null,
    claudeDir: (state) => state.claudeConfigDir || null,
    claudeHooksDir: (state) => state.globalConfigDir ? `${state.globalConfigDir}/claude-hooks` : null,
    legacyShouldersDir: (state) => state.path ? `${state.path}/.shoulders` : null,
    legacyProjectDir: (state) => state.path ? `${state.path}/.project` : null,
    legacyClaudeDir: (state) => state.path ? `${state.path}/.claude` : null,
    instructionsFilePath: (state) => state.path ? `${state.path}/_instructions.md` : null,
    internalInstructionsPath: (state) => state.workspaceDataDir ? `${state.workspaceDataDir}/project/instructions.md` : null,
  },

  actions: {
    async openWorkspace(path) {
      this.path = path

      // Resolve Altals global storage (~/.altals/)
      try { this.globalConfigDir = await invoke('get_global_config_dir') }
      catch { this.globalConfigDir = '' }
      this.workspaceId = this.globalConfigDir ? await hashWorkspacePath(path) : ''
      this.workspaceDataDir = resolveWorkspaceDataDir(this.globalConfigDir, this.workspaceId)
      this.claudeConfigDir = resolveClaudeConfigDir(this.globalConfigDir)

      // Initialize external workspace metadata
      await this.initWorkspaceDataDir()

      // Initialize external project metadata
      await this.initProjectDir()

      // Install Claude Code edit interception hooks globally
      await this.installEditHooks()

      // Load settings
      await this.loadSettings()

      // Watch both the real workspace and Altals-owned external metadata
      await invoke('watch_directory', { paths: [path, this.workspaceDataDir].filter(Boolean) })

      // Hot-reload _instructions.md on change
      this._instructionsUnlisten = await listen('fs-change', (event) => {
        const paths = event.payload?.paths || []
        const instructionsPaths = [
          this.instructionsFilePath,
          this.internalInstructionsPath,
        ].filter(Boolean)
        if (paths.some(path => instructionsPaths.includes(path))) {
          this.loadInstructions()
        }
      })

      // Load usage data
      import('./usage').then(({ useUsageStore }) => {
        const usageStore = useUsageStore()
        usageStore.loadSettings()
        usageStore.loadMonth()
        usageStore.loadTrend()
      })

      // Start git auto-commit
      this.startAutoCommit()

      // Initialize GitHub sync
      this.initGitHub()

      // Persist last workspace + add to recents
      try {
        localStorage.setItem('lastWorkspace', path)
        this.addRecent(path)
      } catch (e) { /* ignore */ }

      // Telemetry
      import('../services/telemetry').then(({ events }) => events.workspaceOpen())
    },

    // Recent workspaces (persisted in localStorage, max 10)
    getRecentWorkspaces() {
      try {
        return JSON.parse(localStorage.getItem('recentWorkspaces') || '[]')
      } catch { return [] }
    },

    addRecent(path) {
      const recents = this.getRecentWorkspaces().filter(r => r.path !== path)
      recents.unshift({ path, name: path.split('/').pop(), lastOpened: new Date().toISOString() })
      if (recents.length > 10) recents.length = 10
      localStorage.setItem('recentWorkspaces', JSON.stringify(recents))
    },

    removeRecent(path) {
      const recents = this.getRecentWorkspaces().filter(r => r.path !== path)
      localStorage.setItem('recentWorkspaces', JSON.stringify(recents))
    },

    async closeWorkspace() {
      await this.cleanup()
      this.path = null
      this.systemPrompt = ''
      this.instructions = ''
      this.apiKey = ''
      this.apiKeys = {}
      this.modelsConfig = null
      this.skillsManifest = null
      this.workspaceId = ''
      this.workspaceDataDir = ''
      this.claudeConfigDir = ''
      localStorage.removeItem('lastWorkspace')
    },

    async _pathExists(path) {
      if (!path) return false
      try {
        return await invoke('path_exists', { path })
      } catch {
        return false
      }
    },

    async _copyFileIfMissing(src, dest) {
      if (!src || !dest) return false
      if (!(await this._pathExists(src)) || await this._pathExists(dest)) return false
      const content = await invoke('read_file', { path: src })
      await invoke('write_file', { path: dest, content })
      return true
    },

    async _copyDirIfMissing(src, dest) {
      if (!src || !dest) return false
      if (!(await this._pathExists(src)) || await this._pathExists(dest)) return false
      await invoke('copy_dir', { src, dest })
      return true
    },

    async initWorkspaceDataDir() {
      const altalsDir = this.shouldersDir
      const legacyDir = this.legacyShouldersDir
      if (!altalsDir) return

      await invoke('create_dir', { path: altalsDir })

      if (legacyDir && legacyDir !== altalsDir && await this._pathExists(legacyDir)) {
        const privateFiles = [
          'system.md',
          'pending-edits.json',
          'comments.json',
          '.direct-mode',
          '.env',
          'models.json',
          'tools.json',
          'editor-state.json',
          'open-sessions.json',
        ]
        for (const name of privateFiles) {
          await this._copyFileIfMissing(`${legacyDir}/${name}`, `${altalsDir}/${name}`)
        }
        await this._copyDirIfMissing(`${legacyDir}/chats`, `${altalsDir}/chats`)
      }

      if (!(await this._pathExists(`${altalsDir}/system.md`))) {
        await invoke('write_file', {
          path: `${altalsDir}/system.md`,
          content: `You are a writing assistant integrated into Altals, a markdown editor.

When suggesting completions:
- Match the user's writing style and tone
- Continue naturally from the context
- Offer varied options (different lengths, approaches)

When reviewing text:
- Be concise and specific
- Focus on clarity and impact
- Suggest concrete improvements
`,
        })
      }

      if (!(await this._pathExists(`${altalsDir}/pending-edits.json`))) {
        await invoke('write_file', {
          path: `${altalsDir}/pending-edits.json`,
          content: '[]',
        })
      }

      // Ensure global models.json exists
      if (this.globalConfigDir) {
        const globalModelsPath = `${this.globalConfigDir}/models.json`
        const globalModelsExists = await this._pathExists(globalModelsPath)
        if (!globalModelsExists) {
          // Try migrating from workspace-local models.json
          let migrated = false
          const localModelsPath = `${altalsDir}/models.json`
          try {
            const localRaw = await invoke('read_file', { path: localModelsPath })
            JSON.parse(localRaw) // validate JSON
            await invoke('write_file', { path: globalModelsPath, content: localRaw })
            migrated = true
          } catch { /* no local config to migrate */ }

          if (!migrated) {
            await invoke('write_file', {
              path: globalModelsPath,
              content: JSON.stringify(getDefaultModelsConfig(), null, 2),
            })
          }
        }
      }

      // Ensure chats directory exists
      if (!(await this._pathExists(`${altalsDir}/chats`))) {
        await invoke('create_dir', { path: `${altalsDir}/chats` })
      }

      await invoke('write_file', {
        path: `${altalsDir}/workspace.json`,
        content: JSON.stringify({
          id: this.workspaceId,
          path: this.path,
          name: this.path?.split('/').pop() || '',
          lastOpenedAt: new Date().toISOString(),
        }, null, 2),
      }).catch(() => {})
    },

    async initProjectDir() {
      const projectDir = this.projectDir
      const altalsDir = this.shouldersDir
      const legacyShouldersDir = this.legacyShouldersDir
      const legacyProjectDir = this.legacyProjectDir
      if (!projectDir) return

      await invoke('create_dir', { path: projectDir })

      if (legacyProjectDir && legacyProjectDir !== projectDir && await this._pathExists(legacyProjectDir)) {
        await this._copyDirIfMissing(`${legacyProjectDir}/references`, `${projectDir}/references`)
        await this._copyDirIfMissing(`${legacyProjectDir}/styles`, `${projectDir}/styles`)
        await this._copyDirIfMissing(`${legacyProjectDir}/skills`, `${projectDir}/skills`)
        await this._copyFileIfMissing(`${legacyProjectDir}/citation-style.json`, `${projectDir}/citation-style.json`)
        await this._copyFileIfMissing(`${legacyProjectDir}/pdf-settings.json`, `${projectDir}/pdf-settings.json`)
        await this._copyFileIfMissing(`${legacyProjectDir}/instructions.md`, `${projectDir}/instructions.md`)
      }

      if (legacyShouldersDir && legacyShouldersDir !== altalsDir && await this._pathExists(legacyShouldersDir)) {
        await this._copyDirIfMissing(`${legacyShouldersDir}/references`, `${projectDir}/references`)
        await this._copyDirIfMissing(`${legacyShouldersDir}/styles`, `${projectDir}/styles`)
        await this._copyFileIfMissing(`${legacyShouldersDir}/pdf-settings.json`, `${projectDir}/pdf-settings.json`)
        await this._copyFileIfMissing(`${legacyShouldersDir}/citation-style.json`, `${projectDir}/citation-style.json`)
      }

      // Ensure references directories exist
      const refsDir = `${projectDir}/references`
      if (!(await this._pathExists(refsDir))) {
        await invoke('create_dir', { path: refsDir })
        await invoke('create_dir', { path: `${refsDir}/pdfs` })
        await invoke('create_dir', { path: `${refsDir}/fulltext` })
        await invoke('write_file', { path: `${refsDir}/library.json`, content: '[]' })
      } else {
        await invoke('create_dir', { path: `${refsDir}/pdfs` }).catch(() => {})
        await invoke('create_dir', { path: `${refsDir}/fulltext` }).catch(() => {})
        if (!(await this._pathExists(`${refsDir}/library.json`))) {
          await invoke('write_file', { path: `${refsDir}/library.json`, content: '[]' })
        }
      }

      // Ensure styles directory exists
      await invoke('create_dir', { path: `${projectDir}/styles` }).catch(() => {})

      // Ensure skills directory and default skill exist
      const skillsDir = `${projectDir}/skills`
      if (!(await this._pathExists(skillsDir))) {
        await invoke('create_dir', { path: skillsDir })
        await invoke('create_dir', { path: `${skillsDir}/altals-meta` })
        await invoke('write_file', {
          path: `${skillsDir}/skills.json`,
          content: JSON.stringify({
            skills: [{
              name: 'altals-meta',
              description: 'Information about the Altals app. Trigger: user asks about app features, support, or how Altals works.',
              path: 'skills/altals-meta/SKILL.md',
            }],
          }, null, 2),
        })
        await invoke('write_file', {
          path: `${skillsDir}/altals-meta/SKILL.md`,
          content: DEFAULT_SKILL_CONTENT,
        })
      } else if (!(await this._pathExists(`${skillsDir}/altals-meta/SKILL.md`))) {
        await invoke('create_dir', { path: `${skillsDir}/altals-meta` }).catch(() => {})
        await invoke('write_file', {
          path: `${skillsDir}/altals-meta/SKILL.md`,
          content: DEFAULT_SKILL_CONTENT,
        })
      }

      if (legacyProjectDir && legacyProjectDir !== projectDir && await this._pathExists(legacyProjectDir)) {
        await invoke('delete_path', { path: legacyProjectDir }).catch(() => {})
      }
      if (legacyShouldersDir && legacyShouldersDir !== altalsDir && await this._pathExists(legacyShouldersDir)) {
        await invoke('delete_path', { path: legacyShouldersDir }).catch(() => {})
      }

      await this._migrateAutoInstructionsFile()
    },

    async installEditHooks() {
      const claudeDir = this.claudeDir
      const hooksDir = this.claudeHooksDir
      const legacyClaudeDir = this.legacyClaudeDir
      if (!claudeDir || !hooksDir || !this.globalConfigDir) return

      try {
        await invoke('create_dir', { path: claudeDir })
        await invoke('create_dir', { path: hooksDir })
      } catch (e) {
        console.warn('Failed to prepare Claude config directories:', e)
        return
      }

      const hookPath = `${hooksDir}/intercept-edits.sh`
      const hookScript = `#!/bin/bash
# Managed by Altals - edit interception hook
# Records Claude Code Edit/Write tool calls for review (non-blocking)

ALTALS_HOME=${JSON.stringify(this.globalConfigDir)}

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

if [[ "$TOOL_NAME" != "Edit" && "$TOOL_NAME" != "Write" ]]; then
  exit 0
fi

WORKSPACE_DIR=$(pwd -P)
if [[ -z "$WORKSPACE_DIR" ]]; then
  exit 0
fi

hash_workspace() {
  if command -v shasum >/dev/null 2>&1; then
    printf '%s' "$1" | shasum -a 256 | awk '{print $1}'
    return
  fi
  if command -v sha256sum >/dev/null 2>&1; then
    printf '%s' "$1" | sha256sum | awk '{print $1}'
    return
  fi
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$1" <<'PY'
import hashlib
import sys
print(hashlib.sha256(sys.argv[1].encode("utf-8")).hexdigest())
PY
    return
  fi
  exit 1
}

WORKSPACE_HASH=$(hash_workspace "$WORKSPACE_DIR")
if [[ -z "$WORKSPACE_HASH" ]]; then
  exit 0
fi

WORKSPACE_DATA_DIR="$ALTALS_HOME/workspaces/$WORKSPACE_HASH"
if [[ ! -d "$WORKSPACE_DATA_DIR" ]]; then
  exit 0
fi

# Direct mode: skip recording entirely
if [[ -f "$WORKSPACE_DATA_DIR/.direct-mode" ]]; then
  exit 0
fi

mkdir -p "$WORKSPACE_DATA_DIR"
PENDING_FILE="$WORKSPACE_DATA_DIR/pending-edits.json"
if [[ ! -f "$PENDING_FILE" ]]; then
  echo "[]" > "$PENDING_FILE"
fi

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
ID="edit-$(date +%s)-$$"
TOOL_INPUT=$(echo "$INPUT" | jq -r '.tool_input // empty')

if [[ "$TOOL_NAME" == "Edit" ]]; then
  FILE_PATH=$(echo "$TOOL_INPUT" | jq -r '.file_path')
  OLD_STRING=$(echo "$TOOL_INPUT" | jq -r '.old_string')
  NEW_STRING=$(echo "$TOOL_INPUT" | jq -r '.new_string')
  OLD_CONTENT=""
  if [[ -f "$FILE_PATH" ]]; then
    OLD_CONTENT=$(cat "$FILE_PATH")
  fi
  NEW_EDIT=$(jq -n \\
    --arg id "$ID" --arg ts "$TIMESTAMP" --arg tool "$TOOL_NAME" \\
    --arg fp "$FILE_PATH" --arg os "$OLD_STRING" --arg ns "$NEW_STRING" \\
    --arg old_content "$OLD_CONTENT" \\
    '{id:$id,timestamp:$ts,tool:$tool,file_path:$fp,old_string:$os,new_string:$ns,old_content:$old_content,status:"pending"}')
elif [[ "$TOOL_NAME" == "Write" ]]; then
  FILE_PATH=$(echo "$TOOL_INPUT" | jq -r '.file_path')
  CONTENT=$(echo "$TOOL_INPUT" | jq -r '.content')
  if [[ -f "$FILE_PATH" ]]; then
    OLD_CONTENT=$(cat "$FILE_PATH")
    NEW_EDIT=$(jq -n \\
      --arg id "$ID" --arg ts "$TIMESTAMP" --arg tool "$TOOL_NAME" \\
      --arg fp "$FILE_PATH" --arg content "$CONTENT" --arg old_content "$OLD_CONTENT" \\
      '{id:$id,timestamp:$ts,tool:$tool,file_path:$fp,content:$content,old_content:$old_content,status:"pending"}')
  else
    NEW_EDIT=$(jq -n \\
      --arg id "$ID" --arg ts "$TIMESTAMP" --arg tool "$TOOL_NAME" \\
      --arg fp "$FILE_PATH" --arg content "$CONTENT" \\
      '{id:$id,timestamp:$ts,tool:$tool,file_path:$fp,content:$content,old_content:null,status:"pending"}')
  fi
fi

CURRENT=$(cat "$PENDING_FILE")
echo "$CURRENT" | jq ". + [$NEW_EDIT]" > "$PENDING_FILE"
exit 0
`
      try {
        await invoke('write_file', { path: hookPath, content: hookScript })
      } catch (e) {
        console.warn('Failed to write hook script:', e)
        return
      }

      // Merge into user-level Claude settings without clobbering unrelated hooks
      let settings = {}
      try {
        const existing = await invoke('read_file', { path: `${claudeDir}/settings.json` })
        settings = JSON.parse(existing)
      } catch (e) {
        // File doesn't exist or invalid JSON - start fresh
      }

      if (!settings.hooks) settings.hooks = {}
      if (!Array.isArray(settings.hooks.PreToolUse)) settings.hooks.PreToolUse = []

      settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter(h => !(
        h.matcher === 'Edit|Write' &&
        h.hooks?.some(hh => String(hh.command || '').includes('intercept-edits.sh'))
      ))

      settings.hooks.PreToolUse.push({
        matcher: 'Edit|Write',
        hooks: [{
          type: 'command',
          command: `bash ${JSON.stringify(hookPath)}`,
        }],
      })

      try {
        await invoke('write_file', {
          path: `${claudeDir}/settings.json`,
          content: JSON.stringify(settings, null, 2),
        })
      } catch (e) {
        console.warn('Failed to write Claude settings.json:', e)
      }

      // Remove the old workspace-local Altals hook to avoid duplicate interception
      if (legacyClaudeDir && await this._pathExists(`${legacyClaudeDir}/settings.json`)) {
        try {
          const legacyRaw = await invoke('read_file', { path: `${legacyClaudeDir}/settings.json` })
          const legacySettings = JSON.parse(legacyRaw)
          if (!legacySettings.hooks) legacySettings.hooks = {}
          if (Array.isArray(legacySettings.hooks.PreToolUse)) {
            legacySettings.hooks.PreToolUse = legacySettings.hooks.PreToolUse.filter(h => !(
              h.matcher === 'Edit|Write' &&
              h.hooks?.some(hh => String(hh.command || '').includes('.claude/hooks/intercept-edits.sh'))
            ))
            await invoke('write_file', {
              path: `${legacyClaudeDir}/settings.json`,
              content: JSON.stringify(legacySettings, null, 2),
            }).catch(() => {})
          }
        } catch {
          // Ignore legacy config cleanup failures
        }
      }

      if (legacyClaudeDir && await this._pathExists(`${legacyClaudeDir}/hooks/intercept-edits.sh`)) {
        await invoke('delete_path', { path: `${legacyClaudeDir}/hooks/intercept-edits.sh` }).catch(() => {})
      }
    },

    async loadSettings() {
      const shouldersDir = this.shouldersDir
      if (!shouldersDir) return

      // Load system prompt
      try {
        this.systemPrompt = await invoke('read_file', {
          path: `${shouldersDir}/system.md`,
        })
      } catch (e) {
        this.systemPrompt = ''
      }

      // Load user instructions (_instructions.md at workspace root)
      await this.loadInstructions()

      // Load API keys from global ~/.altals/keys.env
      this.apiKeys = await this.loadGlobalKeys()

      // Migration: if global is empty, check workspace .env for real keys
      if (Object.keys(this.apiKeys).length === 0) {
        try {
          const envContent = await invoke('read_file', { path: `${shouldersDir}/.env` })
          const workspaceKeys = {}
          for (const line of envContent.split('\n')) {
            const trimmed = line.trim()
            if (!trimmed || trimmed.startsWith('#')) continue
            const eqIdx = trimmed.indexOf('=')
            if (eqIdx > 0) {
              const key = trimmed.substring(0, eqIdx).trim()
              const value = trimmed.substring(eqIdx + 1).trim()
              if (value && !value.includes('your-')) {
                workspaceKeys[key] = value
              }
            }
          }
          if (Object.keys(workspaceKeys).length > 0) {
            await this.saveGlobalKeys(workspaceKeys)
            this.apiKeys = workspaceKeys
          }
        } catch { /* no workspace .env — that's fine */ }
      }

      // Backwards-compat alias
      this.apiKey = this.apiKeys.ANTHROPIC_API_KEY || ''

      // Load models config from global directory
      try {
        const modelsPath = this._modelsPath()
        const modelsContent = await invoke('read_file', { path: modelsPath })
        const { config, changed } = mergeWithDefaultModelsConfig(JSON.parse(modelsContent))
        this.modelsConfig = config
        if (changed) {
          await invoke('write_file', {
            path: modelsPath,
            content: JSON.stringify(config, null, 2),
          })
        }
      } catch (e) {
        this.modelsConfig = null
      }

      // Load tool permissions
      await this.loadToolPermissions()

      // Load skills manifest
      await this.loadSkillsManifest()
    },

    async loadSkillsManifest() {
      const projectDir = this.projectDir
      if (!projectDir) { this.skillsManifest = null; return }
      try {
        const skillsPath = `${projectDir}/skills/skills.json`
        const exists = await this._pathExists(skillsPath)
        if (!exists) { this.skillsManifest = null; return }
        const content = await invoke('read_file', { path: skillsPath })
        const data = JSON.parse(content)
        this.skillsManifest = Array.isArray(data.skills)
          ? data.skills.map(skill => ({
            ...skill,
            path: resolveSkillPath(projectDir, skill.path),
          }))
          : null
      } catch {
        this.skillsManifest = null
      }
    },

    async loadGlobalKeys() {
      if (!this.globalConfigDir) return {}
      const keysPath = `${this.globalConfigDir}/keys.env`
      try {
        const exists = await invoke('path_exists', { path: keysPath })
        if (!exists) return {}
        const content = await invoke('read_file', { path: keysPath })
        const keys = {}
        for (const line of content.split('\n')) {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith('#')) continue
          const eqIdx = trimmed.indexOf('=')
          if (eqIdx > 0) {
            const key = trimmed.substring(0, eqIdx).trim()
            const value = trimmed.substring(eqIdx + 1).trim()
            if (value) keys[key] = value
          }
        }
        return keys
      } catch (e) {
        console.warn('Failed to load global keys:', e)
        return {}
      }
    },

    async saveGlobalKeys(keys) {
      if (!this.globalConfigDir) return
      const keysPath = `${this.globalConfigDir}/keys.env`
      const lines = []
      for (const [k, v] of Object.entries(keys)) {
        if (v) lines.push(`${k}=${v}`)
      }
      try {
        await invoke('write_file', {
          path: keysPath,
          content: lines.length > 0 ? lines.join('\n') + '\n' : '',
        })
      } catch (e) {
        console.warn('Failed to save global keys:', e)
      }
    },

    _modelsPath() {
      if (this.globalConfigDir) return `${this.globalConfigDir}/models.json`
      if (this.shouldersDir) return `${this.shouldersDir}/models.json`
      return ''
    },

    async saveModelsConfig(config) {
      const modelsPath = this._modelsPath()
      if (!modelsPath) return null

      const { config: normalized } = mergeWithDefaultModelsConfig(config || {})
      await invoke('write_file', {
        path: modelsPath,
        content: JSON.stringify(normalized, null, 2),
      })
      this.modelsConfig = normalized
      return normalized
    },

    async syncProviderModels({ providerIds = null } = {}) {
      if (!this.modelsConfig) {
        await this.loadSettings()
      }

      const baseConfig = mergeWithDefaultModelsConfig(this.modelsConfig || getDefaultModelsConfig()).config
      let nextConfig = baseConfig
      let addedCount = 0
      const syncedProviders = []
      const failedProviders = []

      const targetIds = (Array.isArray(providerIds) && providerIds.length > 0
        ? providerIds
        : Object.keys(nextConfig.providers || {})
      ).filter(providerSupportsModelSync)

      for (const providerId of targetIds) {
        const providerConfig = nextConfig.providers?.[providerId]
        const keyEnv = providerConfig?.apiKeyEnv
        const apiKey = keyEnv ? this.apiKeys?.[keyEnv] : ''
        if (!apiKey || apiKey.includes('your-')) continue

        const baseUrl = providerConfig?.customUrl || providerConfig?.url || getProviderDefaultUrl(providerId)
        if (!baseUrl) continue

        try {
          const remoteModels = await invoke('model_sync_list_openai_models', {
            baseUrl,
            apiKey,
          })
          const merged = mergeRemoteModelsIntoConfig(
            nextConfig,
            providerId,
            (remoteModels || []).map(entry => entry?.id).filter(Boolean),
          )
          nextConfig = merged.config
          addedCount += merged.addedCount
          syncedProviders.push(providerId)
        } catch (error) {
          failedProviders.push({
            provider: providerId,
            error: error?.message || String(error),
          })
        }
      }

      if (JSON.stringify(nextConfig) !== JSON.stringify(baseConfig)) {
        await this.saveModelsConfig(nextConfig)
      } else {
        this.modelsConfig = nextConfig
      }

      return {
        addedCount,
        syncedProviders,
        failedProviders,
      }
    },

    async _ensureInternalInstructionsFile(seedContent = DEFAULT_PROJECT_INSTRUCTIONS) {
      const filePath = this.internalInstructionsPath
      if (!filePath) return
      const exists = await invoke('path_exists', { path: filePath })
      if (exists) return

      await invoke('write_file', {
        path: filePath,
        content: seedContent,
      })
    },

    async _migrateAutoInstructionsFile() {
      const rootPath = this.instructionsFilePath
      const internalPath = this.internalInstructionsPath
      if (!rootPath || !internalPath) return

      const rootExists = await invoke('path_exists', { path: rootPath })
      if (!rootExists) return

      try {
        const raw = await invoke('read_file', { path: rootPath })
        if (!isDefaultInstructionsTemplate(raw)) return

        await this._ensureInternalInstructionsFile(raw)
        await invoke('delete_path', { path: rootPath })
      } catch (e) {
        console.warn('Failed to migrate auto-generated instructions file:', e)
      }
    },

    async loadInstructions() {
      const rootPath = this.instructionsFilePath
      const internalPath = this.internalInstructionsPath
      if (!rootPath || !internalPath) return

      try {
        let rootRaw = null
        let internalRaw = null

        try {
          rootRaw = await invoke('read_file', { path: rootPath })
        } catch { /* no manual root instructions */ }

        if (rootRaw !== null && !isDefaultInstructionsTemplate(rootRaw)) {
          this.instructions = stripInstructionComments(rootRaw)
          return
        }

        try {
          internalRaw = await invoke('read_file', { path: internalPath })
        } catch { /* no internal instructions yet */ }

        if (internalRaw !== null) {
          this.instructions = stripInstructionComments(internalRaw)
          return
        }

        this.instructions = rootRaw !== null ? stripInstructionComments(rootRaw) : ''
      } catch (e) {
        this.instructions = ''
      }
    },

    async openInstructionsFile() {
      const rootPath = this.instructionsFilePath
      const internalPath = this.internalInstructionsPath
      if (!rootPath || !internalPath) return

      let filePath = internalPath
      const rootExists = await invoke('path_exists', { path: rootPath })

      if (rootExists) {
        try {
          const rootRaw = await invoke('read_file', { path: rootPath })
          if (!isDefaultInstructionsTemplate(rootRaw)) {
            filePath = rootPath
          } else {
            await this._migrateAutoInstructionsFile()
          }
        } catch { /* fall back to internal instructions */ }
      }

      if (filePath === internalPath) {
        await this._ensureInternalInstructionsFile()
      }

      // Open in editor
      const { useEditorStore } = await import('./editor')
      const editorStore = useEditorStore()
      editorStore.openFile(filePath)
    },

    async loadToolPermissions() {
      if (!this.globalConfigDir) return
      const globalPath = `${this.globalConfigDir}/tools.json`
      try {
        const raw = await invoke('read_file', { path: globalPath })
        const data = JSON.parse(raw)
        this.disabledTools = Array.isArray(data.disabled) ? data.disabled : []
      } catch {
        // Global file doesn't exist — try migrating from workspace-local
        if (this.shouldersDir) {
          try {
            const localRaw = await invoke('read_file', { path: `${this.shouldersDir}/tools.json` })
            const localData = JSON.parse(localRaw)
            this.disabledTools = Array.isArray(localData.disabled) ? localData.disabled : []
            // Migrate to global
            await this.saveToolPermissions()
          } catch {
            this.disabledTools = []
          }
        } else {
          this.disabledTools = []
        }
      }
    },

    async saveToolPermissions() {
      if (!this.globalConfigDir) return
      try {
        await invoke('write_file', {
          path: `${this.globalConfigDir}/tools.json`,
          content: JSON.stringify({ version: 1, disabled: this.disabledTools }, null, 2),
        })
      } catch (e) {
        console.warn('Failed to save tool permissions:', e)
      }
    },

    toggleTool(name) {
      const idx = this.disabledTools.indexOf(name)
      if (idx >= 0) {
        this.disabledTools.splice(idx, 1)
      } else {
        this.disabledTools.push(name)
      }
      this.saveToolPermissions()
    },

    toggleLeftSidebar() {
      this.leftSidebarOpen = !this.leftSidebarOpen
      localStorage.setItem('leftSidebarOpen', String(this.leftSidebarOpen))
    },

    toggleRightSidebar() {
      this.rightSidebarOpen = !this.rightSidebarOpen
      localStorage.setItem('rightSidebarOpen', String(this.rightSidebarOpen))
    },

    toggleBottomPanel() {
      this.bottomPanelOpen = !this.bottomPanelOpen
      localStorage.setItem('bottomPanelOpen', String(this.bottomPanelOpen))
    },

    openBottomPanel() {
      if (!this.bottomPanelOpen) {
        this.bottomPanelOpen = true
        localStorage.setItem('bottomPanelOpen', 'true')
      }
    },

    setBottomPanelHeight(h) {
      this.bottomPanelHeight = h
      localStorage.setItem('bottomPanelHeight', String(h))
    },

    openSettings(section = null) {
      this.settingsSection = section
      this.settingsOpen = true
    },

    closeSettings() {
      this.settingsOpen = false
      this.settingsSection = null
    },

    setSelectedModelId(id) {
      this.selectedModelId = id
      localStorage.setItem('lastModelId', id)
    },

    setGhostModelId(modelId) {
      this.ghostModelId = modelId
      localStorage.setItem('ghostModelId', modelId)
    },

    setGhostEnabled(val) {
      this.ghostEnabled = val
      localStorage.setItem('ghostEnabled', String(val))
    },

    toggleLivePreview() {
      this.livePreviewEnabled = !this.livePreviewEnabled
      localStorage.setItem('livePreviewEnabled', String(this.livePreviewEnabled))
    },

    toggleSoftWrap() {
      this.softWrap = !this.softWrap
      localStorage.setItem('softWrap', String(this.softWrap))
    },

    setWrapColumn(n) {
      this.wrapColumn = Math.max(0, parseInt(n) || 0)
      localStorage.setItem('wrapColumn', String(this.wrapColumn))
    },

    toggleSpellcheck() {
      this.spellcheck = !this.spellcheck
      localStorage.setItem('spellcheck', String(this.spellcheck))
    },

    zoomIn() {
      this.editorFontSize = Math.min(24, this.editorFontSize + 1)
      this.uiFontSize = Math.min(20, this.uiFontSize + 1)
      this.applyFontSizes()
    },

    zoomOut() {
      this.editorFontSize = Math.max(10, this.editorFontSize - 1)
      this.uiFontSize = Math.max(9, this.uiFontSize - 1)
      this.applyFontSizes()
    },

    resetZoom() {
      this.editorFontSize = 14
      this.uiFontSize = 13
      this.applyFontSizes()
    },

    setZoomPercent(pct) {
      this.editorFontSize = Math.round(14 * pct / 100)
      this.uiFontSize = Math.round(13 * pct / 100)
      this.editorFontSize = Math.max(10, Math.min(24, this.editorFontSize))
      this.uiFontSize = Math.max(9, Math.min(20, this.uiFontSize))
      this.applyFontSizes()
    },

    setDocxZoom(pct) {
      this.docxZoomPercent = Math.max(50, Math.min(200, Math.round(pct)))
      localStorage.setItem('docxZoomPercent', String(this.docxZoomPercent))
    },

    docxZoomIn() {
      this.setDocxZoom(this.docxZoomPercent + 10)
    },

    docxZoomOut() {
      this.setDocxZoom(this.docxZoomPercent - 10)
    },

    resetDocxZoom() {
      this.setDocxZoom(100)
    },

    applyFontSizes() {
      document.documentElement.style.setProperty('--editor-font-size', this.editorFontSize + 'px')
      document.documentElement.style.setProperty('--ui-font-size', this.uiFontSize + 'px')
      localStorage.setItem('editorFontSize', String(this.editorFontSize))
      localStorage.setItem('uiFontSize', String(this.uiFontSize))
    },

    setProseFont(name) {
      this.proseFont = name
      localStorage.setItem('proseFont', name)
      const stacks = {
        inter: "'Inter', system-ui, sans-serif",
        stix:  "'STIX Two Text', Georgia, serif",
        mono:  "'JetBrains Mono', 'Menlo', 'Consolas', monospace",
      }
      document.documentElement.style.setProperty('--font-prose', stacks[name] || stacks.geist)
    },

    restoreProseFont() {
      this.setProseFont(this.proseFont)
    },

    setTheme(name) {
      this.theme = name
      localStorage.setItem('theme', name)
      import('../services/telemetry').then(({ events }) => events.themeChange(name))
      // Remove any existing theme class, apply new one
      const el = document.documentElement
      el.classList.remove('theme-light', 'theme-monokai', 'theme-nord', 'theme-solarized', 'theme-humane', 'theme-one-light', 'theme-dracula')
      if (name !== 'default') {
        el.classList.add(`theme-${name}`)
      }
    },

    restoreTheme() {
      const saved = localStorage.getItem('theme')
      if (!saved) {
        // First launch — pick based on OS preference
        const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
        this.setTheme(prefersDark ? 'monokai' : 'humane')
      } else if (this.theme !== 'default') {
        document.documentElement.classList.add(`theme-${this.theme}`)
      }
    },

    startAutoCommit() {
      this.stopAutoCommit()
      if (!this.path) return

      this.gitAutoCommitTimer = setInterval(async () => {
        await this.autoCommit()
      }, this.gitAutoCommitInterval)
    },

    stopAutoCommit() {
      if (this.gitAutoCommitTimer) {
        clearInterval(this.gitAutoCommitTimer)
        this.gitAutoCommitTimer = null
      }
    },

    async autoCommit() {
      if (!this.path) return
      try {
        // Check if git is initialized
        const gitExists = await invoke('path_exists', { path: `${this.path}/.git` })
        if (!gitExists) {
          await gitInit(this.path)
        }

        // Stage all changes
        await gitAdd(this.path)

        // Check if there are changes to commit
        const status = await gitStatus(this.path)
        if (status.trim()) {
          const now = new Date()
          const timestamp = now.toISOString().replace('T', ' ').substring(0, 16)
          await gitCommit(this.path, `Auto: ${timestamp}`)

          // Auto-push if GitHub is connected
          await this.autoSync()
        }
      } catch (e) {
        console.warn('Auto-commit failed:', e)
      }
    },

    // ── GitHub Sync ──

    async initGitHub() {
      try {
        const { loadGitHubToken, getGitHubUser, syncState } = await import('../services/githubSync')
        const stored = await loadGitHubToken()
        if (!stored?.token) return

        this.githubToken = stored
        // Verify token is still valid by fetching user
        try {
          const user = await getGitHubUser(stored.token)
          this.githubUser = {
            login: user.login,
            name: user.name,
            email: user.email,
            id: user.id,
            avatarUrl: user.avatar_url,
          }
        } catch {
          // Token invalid — clear it
          this.githubToken = null
          this.githubUser = null
          return
        }

        // Check if workspace has a remote
        if (this.path) {
          this.remoteUrl = await gitRemoteGetUrl(this.path)
          if (this.remoteUrl) {
            this.syncStatus = 'idle'
            this.startSyncTimer()
          } else {
            this.syncStatus = 'disconnected'
          }
        }
      } catch (e) {
        console.warn('[github] Init failed:', e)
      }
    },

    startSyncTimer() {
      this.stopSyncTimer()
      if (!this.githubToken?.token || !this.remoteUrl) return

      // Fetch from remote every 5 minutes
      this.syncTimer = setInterval(async () => {
        await this.fetchRemoteChanges()
      }, 5 * 60 * 1000)
    },

    stopSyncTimer() {
      if (this.syncTimer) {
        clearInterval(this.syncTimer)
        this.syncTimer = null
      }
    },

    async autoSync() {
      if (!this.path || !this.githubToken?.token) return
      const remote = await gitRemoteGetUrl(this.path)
      if (!remote) return

      // Use the full sync cycle (fetch→check→pull/merge→push)
      const { syncNow, syncState } = await import('../services/githubSync')
      await syncNow(this.path, this.githubToken.token)
      this._applySyncState(syncState)
    },

    async fetchRemoteChanges() {
      if (!this.path || !this.githubToken?.token) return
      const remote = await gitRemoteGetUrl(this.path)
      if (!remote) return

      const { fetchAndPull, syncState } = await import('../services/githubSync')
      const result = await fetchAndPull(this.path, this.githubToken.token)
      this._applySyncState(syncState)

      // If files were pulled, reload open files
      if (result.pulled) {
        try {
          const { useFilesStore } = await import('./files')
          const { useEditorStore } = await import('./editor')
          const filesStore = useFilesStore()
          const editorStore = useEditorStore()
          // Reload content for any open tabs
          for (const tab of editorStore.tabs) {
            if (tab.path && filesStore.fileContents[tab.path] !== undefined) {
              try {
                const content = await invoke('read_file', { path: tab.path })
                filesStore.fileContents[tab.path] = content
              } catch {}
            }
          }
        } catch {}
      }

      return result
    },

    async syncNow() {
      if (!this.path || !this.githubToken?.token) return
      const { syncNow, syncState } = await import('../services/githubSync')
      await syncNow(this.path, this.githubToken.token)
      this._applySyncState(syncState)
    },

    _applySyncState(syncState) {
      this.syncStatus = syncState.status
      this.syncError = syncState.error
      this.syncErrorType = syncState.errorType || null
      this.syncConflictBranch = syncState.conflictBranch
      this.lastSyncTime = syncState.lastSyncTime
      this.remoteUrl = syncState.remoteUrl || this.remoteUrl
    },

    async connectGitHub(tokenData) {
      const { storeGitHubToken, getGitHubUser, configureGitUser, ensureGitignore } = await import('../services/githubSync')
      await storeGitHubToken(tokenData)
      this.githubToken = tokenData

      // Use user data from OAuth callback if available, otherwise fetch from GitHub
      let user
      if (tokenData.login) {
        user = tokenData
      } else {
        const ghUser = await getGitHubUser(tokenData.token)
        user = {
          login: ghUser.login,
          name: ghUser.name,
          email: ghUser.email,
          id: ghUser.id,
          avatarUrl: ghUser.avatar_url,
        }
      }

      this.githubUser = {
        login: user.login,
        name: user.name,
        email: user.email,
        id: user.id,
        avatarUrl: user.avatarUrl || user.avatar_url,
      }

      // Set git user identity from GitHub profile
      if (this.path) {
        await configureGitUser(this.path, this.githubUser)
        await ensureGitignore(this.path)
      }
    },

    async disconnectGitHub() {
      const { clearGitHubToken } = await import('../services/githubSync')
      await clearGitHubToken()
      this.stopSyncTimer()
      this.githubToken = null
      this.githubUser = null
      this.syncStatus = 'disconnected'
      this.syncError = null
      this.syncErrorType = null
      this.syncConflictBranch = null
    },

    async linkRepo(cloneUrl) {
      if (!this.path) return
      const { setupRemote, ensureGitignore, syncState } = await import('../services/githubSync')
      await setupRemote(this.path, cloneUrl)
      await ensureGitignore(this.path)
      this.remoteUrl = cloneUrl
      this.syncStatus = 'idle'
      this.startSyncTimer()

      // Initial push
      await this.autoSync()
    },

    async unlinkRepo() {
      if (!this.path) return
      const { removeRemote } = await import('../services/githubSync')
      await removeRemote(this.path)
      this.stopSyncTimer()
      this.remoteUrl = ''
      this.syncStatus = 'disconnected'
      this.syncConflictBranch = null
    },

    async cleanup() {
      this.stopAutoCommit()
      this.stopSyncTimer()
      if (this._instructionsUnlisten) {
        this._instructionsUnlisten()
        this._instructionsUnlisten = null
      }
      if (this.path) {
        await this.autoCommit()
        await invoke('unwatch_directory')
      }
    },
  },
})
