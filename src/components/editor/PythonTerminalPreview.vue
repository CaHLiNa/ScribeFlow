<template>
  <div class="python-terminal-preview" data-surface-context-guard="true">
    <div class="python-terminal-preview__viewport">
      <div v-if="showCommandLine" class="python-terminal-preview__command-line">
        <span class="python-terminal-preview__prompt">$</span>
        <span class="python-terminal-preview__command-text">{{ commandText }}</span>
      </div>

      <pre
        v-if="terminalBody"
        class="python-terminal-preview__output"
        :class="{ 'python-terminal-preview__output--error': !!errorText }"
      >{{ terminalBody }}</pre>
      <div v-else class="python-terminal-preview__empty">{{ emptyCopy }}</div>

      <div v-if="footerLine" class="python-terminal-preview__footer">
        {{ footerLine }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

import { usePythonStore } from '../../stores/python.js'
import { basenamePath } from '../../utils/path.js'
import { useI18n } from '../../i18n'

const props = defineProps({
  filePath: { type: String, required: true },
  sourcePath: { type: String, default: '' },
})

const pythonStore = usePythonStore()
const { t } = useI18n()

const resolvedSourcePath = computed(() => String(props.sourcePath || props.filePath || ''))
const compileState = computed(() => pythonStore.stateForFile(resolvedSourcePath.value) || null)
const fileLabel = computed(() => basenamePath(resolvedSourcePath.value) || resolvedSourcePath.value)

const commandText = computed(() => {
  const commandPreview = String(compileState.value?.commandPreview || '').trim()
  if (commandPreview) return commandPreview
  return pythonStore.hasInterpreter
    ? `python ${fileLabel.value}`
    : t('Python interpreter not found')
})

const showCommandLine = computed(() => pythonStore.hasInterpreter && !!commandText.value)

const outputText = computed(() => {
  const state = compileState.value
  if (!state || state.status === 'running' || state.status === 'error') return ''
  return String(state.stdout || '').trim()
})

const errorText = computed(() => {
  const state = compileState.value

  if (!pythonStore.hasInterpreter) {
    return t('Python interpreter not found. Choose one in Environment settings.')
  }

  if (state.status === 'error') {
    return (
      state.stderr
      || state.errors?.map((issue) => issue.raw || issue.message).join('\n\n')
      || t('Run failed')
    )
  }

  return ''
})

const terminalBody = computed(() => {
  if (errorText.value) return errorText.value
  if (outputText.value) return outputText.value
  if (compileState.value?.status === 'running') return t('Running...')
  return ''
})

const emptyCopy = computed(() => {
  if (!pythonStore.hasInterpreter) {
    return t('Python interpreter not found. Choose one in Environment settings.')
  }
  if (!compileState.value) {
    return t('Run current Python file to see terminal output.')
  }
  if (compileState.value.status === 'running') {
    return t('The current script is still running.')
  }
  return t('This script finished successfully but did not print anything to stdout.')
})

const footerLine = computed(() => {
  const state = compileState.value
  if (!state || state.status === 'running') return ''

  const parts = [
    `${t('Exit code')}: ${state.exitCode ?? 0}`,
  ]

  const durationMs = Number(state.durationMs || 0)
  if (durationMs > 0) {
    parts.push(
      `${t('Running time')}: ${
        durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`
      }`,
    )
  }

  return parts.join('   ')
})
</script>

<style scoped>
.python-terminal-preview {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: color-mix(in srgb, var(--shell-editor-surface) 88%, var(--shell-preview-surface));
}

.python-terminal-preview__viewport {
  min-width: 0;
  min-height: 0;
  width: 100%;
  height: 100%;
  overflow: auto;
  padding: 14px 18px 18px;
}

.python-terminal-preview__command-line {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 12px;
}

.python-terminal-preview__prompt {
  flex: 0 0 auto;
  color: color-mix(in srgb, var(--success) 84%, white 16%);
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.55;
}

.python-terminal-preview__command-text,
.python-terminal-preview__output,
.python-terminal-preview__empty,
.python-terminal-preview__footer {
  color: color-mix(in srgb, var(--text-primary) 94%, transparent);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

.python-terminal-preview__command-text {
  min-width: 0;
}

.python-terminal-preview__output {
  margin: 0;
  padding: 0;
  background: transparent;
}

.python-terminal-preview__output.is-error,
.python-terminal-preview__output--error {
  color: color-mix(in srgb, var(--error) 82%, white 18%);
}

.python-terminal-preview__empty {
  color: var(--text-secondary);
}

.python-terminal-preview__footer {
  margin-top: 14px;
  color: var(--text-muted);
}

@media (max-width: 720px) {
  .python-terminal-preview__viewport {
    padding: 12px 14px 14px;
  }
}
</style>
