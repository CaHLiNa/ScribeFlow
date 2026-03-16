import { invoke } from '@tauri-apps/api/core'

const DEFAULT_SYSTEM_PROMPT = `You are a writing assistant integrated into Altals, a markdown editor.

When suggesting completions:
- Match the user's writing style and tone
- Continue naturally from the context
- Offer varied options (different lengths, approaches)

When reviewing text:
- Be concise and specific
- Focus on clarity and impact
- Suggest concrete improvements
`

export function logWorkspaceBootstrapWarning(step, error) {
  console.warn(`[workspace] ${step} failed:`, error)
}

export async function pathExists(path) {
  if (!path) return false
  try {
    return await invoke('path_exists', { path })
  } catch {
    return false
  }
}

async function copyFileIfMissing(src, dest) {
  if (!src || !dest) return false
  if (!(await pathExists(src)) || await pathExists(dest)) return false
  const content = await invoke('read_file', { path: src })
  await invoke('write_file', { path: dest, content })
  return true
}

async function copyDirIfMissing(src, dest) {
  if (!src || !dest) return false
  if (!(await pathExists(src)) || await pathExists(dest)) return false
  await invoke('copy_dir', { src, dest })
  return true
}

export async function initWorkspaceDataDir({
  altalsDir,
  legacyDir,
  globalConfigDir,
  workspaceId,
  workspacePath,
  defaultModelsConfig,
}) {
  if (!altalsDir) return

  await invoke('create_dir', { path: altalsDir })

  if (legacyDir && legacyDir !== altalsDir && await pathExists(legacyDir)) {
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
      await copyFileIfMissing(`${legacyDir}/${name}`, `${altalsDir}/${name}`)
    }
    await copyDirIfMissing(`${legacyDir}/chats`, `${altalsDir}/chats`)
  }

  if (!(await pathExists(`${altalsDir}/system.md`))) {
    await invoke('write_file', {
      path: `${altalsDir}/system.md`,
      content: DEFAULT_SYSTEM_PROMPT,
    })
  }

  if (!(await pathExists(`${altalsDir}/pending-edits.json`))) {
    await invoke('write_file', {
      path: `${altalsDir}/pending-edits.json`,
      content: '[]',
    })
  }

  if (globalConfigDir) {
    const globalModelsPath = `${globalConfigDir}/models.json`
    const globalModelsExists = await pathExists(globalModelsPath)
    if (!globalModelsExists) {
      let migrated = false
      const localModelsPath = `${altalsDir}/models.json`
      try {
        const localRaw = await invoke('read_file', { path: localModelsPath })
        JSON.parse(localRaw)
        await invoke('write_file', { path: globalModelsPath, content: localRaw })
        migrated = true
      } catch {
        // No valid local config to migrate.
      }

      if (!migrated) {
        await invoke('write_file', {
          path: globalModelsPath,
          content: JSON.stringify(defaultModelsConfig, null, 2),
        })
      }
    }
  }

  if (!(await pathExists(`${altalsDir}/chats`))) {
    await invoke('create_dir', { path: `${altalsDir}/chats` })
  }

  await invoke('write_file', {
    path: `${altalsDir}/workspace.json`,
    content: JSON.stringify({
      id: workspaceId,
      path: workspacePath,
      name: workspacePath?.split('/').pop() || '',
      lastOpenedAt: new Date().toISOString(),
    }, null, 2),
  }).catch(() => {})
}

export async function initProjectDir({
  projectDir,
  altalsDir,
  legacyShouldersDir,
  legacyProjectDir,
  defaultSkillContent,
  migrateAutoInstructions,
}) {
  if (!projectDir) return

  await invoke('create_dir', { path: projectDir })

  if (legacyProjectDir && legacyProjectDir !== projectDir && await pathExists(legacyProjectDir)) {
    await copyDirIfMissing(`${legacyProjectDir}/references`, `${projectDir}/references`)
    await copyDirIfMissing(`${legacyProjectDir}/styles`, `${projectDir}/styles`)
    await copyDirIfMissing(`${legacyProjectDir}/skills`, `${projectDir}/skills`)
    await copyFileIfMissing(`${legacyProjectDir}/citation-style.json`, `${projectDir}/citation-style.json`)
    await copyFileIfMissing(`${legacyProjectDir}/pdf-settings.json`, `${projectDir}/pdf-settings.json`)
    await copyFileIfMissing(`${legacyProjectDir}/instructions.md`, `${projectDir}/instructions.md`)
  }

  if (legacyShouldersDir && legacyShouldersDir !== altalsDir && await pathExists(legacyShouldersDir)) {
    await copyDirIfMissing(`${legacyShouldersDir}/references`, `${projectDir}/references`)
    await copyDirIfMissing(`${legacyShouldersDir}/styles`, `${projectDir}/styles`)
    await copyFileIfMissing(`${legacyShouldersDir}/pdf-settings.json`, `${projectDir}/pdf-settings.json`)
    await copyFileIfMissing(`${legacyShouldersDir}/citation-style.json`, `${projectDir}/citation-style.json`)
  }

  const refsDir = `${projectDir}/references`
  if (!(await pathExists(refsDir))) {
    await invoke('create_dir', { path: refsDir })
    await invoke('create_dir', { path: `${refsDir}/pdfs` })
    await invoke('create_dir', { path: `${refsDir}/fulltext` })
    await invoke('write_file', { path: `${refsDir}/library.json`, content: '[]' })
  } else {
    await invoke('create_dir', { path: `${refsDir}/pdfs` }).catch(() => {})
    await invoke('create_dir', { path: `${refsDir}/fulltext` }).catch(() => {})
    if (!(await pathExists(`${refsDir}/library.json`))) {
      await invoke('write_file', { path: `${refsDir}/library.json`, content: '[]' })
    }
  }

  await invoke('create_dir', { path: `${projectDir}/styles` }).catch(() => {})

  const researchArtifactsPath = `${projectDir}/research-artifacts.json`
  if (!(await pathExists(researchArtifactsPath))) {
    await invoke('write_file', {
      path: researchArtifactsPath,
      content: JSON.stringify({
        version: 1,
        annotations: [],
        notes: [],
      }, null, 2),
    })
  }

  const skillsDir = `${projectDir}/skills`
  if (!(await pathExists(skillsDir))) {
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
      content: defaultSkillContent,
    })
  } else if (!(await pathExists(`${skillsDir}/altals-meta/SKILL.md`))) {
    await invoke('create_dir', { path: `${skillsDir}/altals-meta` }).catch(() => {})
    await invoke('write_file', {
      path: `${skillsDir}/altals-meta/SKILL.md`,
      content: defaultSkillContent,
    })
  }

  if (legacyProjectDir && legacyProjectDir !== projectDir && await pathExists(legacyProjectDir)) {
    await invoke('delete_path', { path: legacyProjectDir }).catch(() => {})
  }
  if (legacyShouldersDir && legacyShouldersDir !== altalsDir && await pathExists(legacyShouldersDir)) {
    await invoke('delete_path', { path: legacyShouldersDir }).catch(() => {})
  }

  if (typeof migrateAutoInstructions === 'function') {
    await migrateAutoInstructions()
  }
}

export async function installEditHooks({
  claudeDir,
  hooksDir,
  legacyClaudeDir,
  globalConfigDir,
}) {
  if (!claudeDir || !hooksDir || !globalConfigDir) return

  try {
    await invoke('create_dir', { path: claudeDir })
    await invoke('create_dir', { path: hooksDir })
  } catch (error) {
    console.warn('Failed to prepare Claude config directories:', error)
    return
  }

  const hookPath = `${hooksDir}/intercept-edits.sh`
  const hookScript = `#!/bin/bash
# Managed by Altals - edit interception hook
# Records Claude Code Edit/Write tool calls for review (non-blocking)

ALTALS_HOME=${JSON.stringify(globalConfigDir)}

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
  } catch (error) {
    console.warn('Failed to write hook script:', error)
    return
  }

  let settings = {}
  try {
    const existing = await invoke('read_file', { path: `${claudeDir}/settings.json` })
    settings = JSON.parse(existing)
  } catch {
    // File does not exist or is invalid JSON.
  }

  if (!settings.hooks) settings.hooks = {}
  if (!Array.isArray(settings.hooks.PreToolUse)) settings.hooks.PreToolUse = []

  settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter(hook => !(
    hook.matcher === 'Edit|Write' &&
    hook.hooks?.some(entry => String(entry.command || '').includes('intercept-edits.sh'))
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
  } catch (error) {
    console.warn('Failed to write Claude settings.json:', error)
  }

  if (legacyClaudeDir && await pathExists(`${legacyClaudeDir}/settings.json`)) {
    try {
      const legacyRaw = await invoke('read_file', { path: `${legacyClaudeDir}/settings.json` })
      const legacySettings = JSON.parse(legacyRaw)
      if (!legacySettings.hooks) legacySettings.hooks = {}
      if (Array.isArray(legacySettings.hooks.PreToolUse)) {
        legacySettings.hooks.PreToolUse = legacySettings.hooks.PreToolUse.filter(hook => !(
          hook.matcher === 'Edit|Write' &&
          hook.hooks?.some(entry => String(entry.command || '').includes('.claude/hooks/intercept-edits.sh'))
        ))
        await invoke('write_file', {
          path: `${legacyClaudeDir}/settings.json`,
          content: JSON.stringify(legacySettings, null, 2),
        }).catch(() => {})
      }
    } catch {
      // Ignore legacy config cleanup failures.
    }
  }

  if (legacyClaudeDir && await pathExists(`${legacyClaudeDir}/hooks/intercept-edits.sh`)) {
    await invoke('delete_path', { path: `${legacyClaudeDir}/hooks/intercept-edits.sh` }).catch(() => {})
  }
}
