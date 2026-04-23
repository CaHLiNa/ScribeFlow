<template>
  <div class="python-terminal-preview" data-surface-context-guard="true">
    <div class="python-terminal-preview__header">
      <div class="python-terminal-preview__title-wrap">
        <div class="python-terminal-preview__eyebrow">{{ t('Terminal output') }}</div>
        <div class="python-terminal-preview__title">{{ fileLabel }}</div>
      </div>
      <div
        class="python-terminal-preview__status"
        :class="{
          'is-running': compileState?.status === 'running',
          'is-error': compileState?.status === 'error',
          'is-ready': compileState?.status === 'success',
        }"
      >
        {{ statusLabel }}
      </div>
    </div>

    <div class="python-terminal-preview__meta">
      <span v-if="interpreterLabel">{{ interpreterLabel }}</span>
      <span v-if="commandLabel">{{ commandLabel }}</span>
    </div>

    <pre class="python-terminal-preview__body">{{ terminalText }}</pre>
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

const statusLabel = computed(() => {
  if (!pythonStore.hasInterpreter) return t('Python interpreter not found')
  if (compileState.value?.status === 'running') return t('Running...')
  if (compileState.value?.status === 'error') return t('Run failed')
  if (compileState.value?.status === 'success') return t('Ready')
  return t('Ready to start')
})

const interpreterLabel = computed(() => {
  const version = String(
    compileState.value?.interpreterVersion || pythonStore.interpreter.version || '',
  ).trim()
  const path = String(
    compileState.value?.interpreterPath || pythonStore.interpreter.path || '',
  ).trim()
  if (!version && !path) return ''
  if (version && path) return `${t('Python interpreter')}: ${path} · Python ${version}`
  if (path) return `${t('Python interpreter')}: ${path}`
  return `${t('Python interpreter')}: Python ${version}`
})

const commandLabel = computed(() => {
  const commandPreview = String(compileState.value?.commandPreview || '').trim()
  if (!commandPreview) return ''
  return `${t('Command')}: ${commandPreview}`
})

const terminalText = computed(() => {
  const state = compileState.value

  if (!pythonStore.hasInterpreter) {
    return t('Python interpreter not found. Choose one in Environment settings.')
  }

  if (!state) {
    return t('Run current Python file to see terminal output.')
  }

  if (state.status === 'running') {
    return `${commandLabel.value || `$ python ${fileLabel.value}`}\n\n${t('Running...')}`
  }

  if (state.status === 'error') {
    const lines = [
      commandLabel.value,
      state.stderr
        || state.errors?.map((issue) => issue.raw || issue.message).join('\n\n')
        || t('Run failed'),
      `${t('Exit code')}: ${state.exitCode ?? -1}`,
    ].filter(Boolean)
    return lines.join('\n\n')
  }

  const outputText = String(state.stdout || '').trim()
  const lines = [
    commandLabel.value,
    outputText || `[${t('no output')}]`,
    `${t('Exit code')}: ${state.exitCode ?? 0}`,
    state.durationMs
      ? `${t('Running time')}: ${
          state.durationMs < 1000
            ? `${state.durationMs}ms`
            : `${(state.durationMs / 1000).toFixed(1)}s`
        }`
      : '',
  ].filter(Boolean)

  return lines.join('\n')
})
</script>

<style scoped>
.python-terminal-preview {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--shell-preview-surface) 94%, black 6%),
      var(--shell-preview-surface)
    );
  color: var(--text-primary);
}

.python-terminal-preview__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--workbench-divider-soft);
}

.python-terminal-preview__title-wrap {
  min-width: 0;
}

.python-terminal-preview__eyebrow {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.python-terminal-preview__title {
  margin-top: 3px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.python-terminal-preview__status {
  flex: 0 0 auto;
  min-height: 24px;
  padding: 4px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface-hover) 70%, transparent);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
}

.python-terminal-preview__status.is-running {
  color: color-mix(in srgb, var(--warning) 78%, white 22%);
}

.python-terminal-preview__status.is-error {
  color: color-mix(in srgb, var(--error) 88%, white 12%);
}

.python-terminal-preview__status.is-ready {
  color: color-mix(in srgb, var(--success) 84%, white 16%);
}

.python-terminal-preview__meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 16px 0;
  color: var(--text-secondary);
  font-size: 12px;
}

.python-terminal-preview__body {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  margin: 10px 16px 16px;
  padding: 14px 15px;
  overflow: auto;
  border: 1px solid color-mix(in srgb, var(--workbench-divider-soft) 82%, transparent);
  border-radius: 10px;
  background:
    linear-gradient(180deg, rgba(0, 0, 0, 0.14), rgba(0, 0, 0, 0.22)),
    color-mix(in srgb, var(--shell-editor-surface) 82%, black 18%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
  color: color-mix(in srgb, var(--text-primary) 94%, transparent);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
