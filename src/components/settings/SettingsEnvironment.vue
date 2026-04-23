<!-- START OF FILE src/components/settings/SettingsEnvironment.vue -->
<template>
  <div class="env-page settings-page">
    <section class="settings-group">
      <div class="settings-group-heading">
        <h4 class="settings-group-title">{{ t('LaTeX') }}</h4>
        <button
          type="button"
          class="diagnostics-refresh-btn"
          :disabled="isRefreshingDiagnostics"
          @click="redetectSystem"
          :title="t('Refresh diagnostics')"
        >
          <svg
            v-if="!isRefreshingDiagnostics"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
            <path d="M3 3v5h5"></path>
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path>
            <path d="M16 21v-5h5"></path>
          </svg>
          <span v-else class="diagnostics-spinner"></span>
          <span class="diagnostics-refresh-label">{{ t('Refresh') }}</span>
        </button>
      </div>
      <div class="settings-group-body">
        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Compiler') }}</div>
          </div>
          <div class="settings-row-control">
            <UiSelect v-model="compilerPreference" size="sm" :options="compilerOptions" />
          </div>
        </div>

        <div
          class="settings-row"
          :class="{ 'is-disabled-row': latexStore.compilerPreference === 'tectonic' }"
        >
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('LaTeX Engine') }}</div>
          </div>
          <div class="settings-row-control">
            <UiSelect
              v-model="enginePreference"
              size="sm"
              :options="engineOptions"
              :disabled="latexStore.compilerPreference === 'tectonic'"
            />
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Build recipe') }}</div>
          </div>
          <div class="settings-row-control">
            <UiSelect v-model="buildRecipe" size="sm" :options="latexBuildRecipeOptions" />
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('System TeX') }}</div>
          </div>
          <div class="settings-row-control compact diagnostic-status">
            <span
              class="status-dot"
              :class="latexStore.systemTexInstalled ? 'is-good' : 'is-none'"
            ></span>
            <span class="status-text">{{
              latexStore.systemTexInstalled ? t('Installed') : t('Not found')
            }}</span>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Tectonic') }}</div>
            <div v-if="latexStore.downloadError" class="settings-row-hint text-error">
              {{ latexStore.downloadError }}
            </div>
          </div>
          <div class="settings-row-control compact diagnostic-status">
            <template v-if="latexStore.tectonicInstalled">
              <span class="status-dot is-good"></span>
              <span class="status-text">{{ t('Installed') }}</span>
            </template>
            <template v-else-if="latexStore.downloading">
              <span class="status-text">{{
                t('Downloading {progress}%', { progress: latexStore.downloadProgress })
              }}</span>
            </template>
            <template v-else>
              <button class="diagnostic-action-btn" @click="latexStore.downloadTectonic()">
                {{ latexStore.downloadError ? t('Retry') : t('Download') }}
              </button>
            </template>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('ChkTeX') }}</div>
          </div>
          <div class="settings-row-control compact diagnostic-status">
            <span
              class="status-dot"
              :class="latexStore.chktexInstalled ? 'is-good' : 'is-none'"
            ></span>
            <span class="status-text">{{
              latexStore.chktexInstalled ? t('Installed') : t('Not found')
            }}</span>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('latexindent') }}</div>
          </div>
          <div class="settings-row-control compact diagnostic-status">
            <span
              class="status-dot"
              :class="latexStore.latexindentInstalled ? 'is-good' : 'is-none'"
            ></span>
            <span class="status-text">{{
              latexStore.latexindentInstalled ? t('Installed') : t('Not found')
            }}</span>
          </div>
        </div>
      </div>
    </section>

    <section class="settings-group">
      <h4 class="settings-group-title">{{ t('Python') }}</h4>
      <div class="settings-group-body">
        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Interpreter') }}</div>
          </div>
          <div class="settings-row-control">
            <UiSelect
              v-model="pythonInterpreterPreference"
              size="sm"
              :options="pythonInterpreterOptions"
            />
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Runtime') }}</div>
          </div>
          <div class="settings-row-control compact diagnostic-status">
            <span
              class="status-dot"
              :class="pythonDiagnosticsDotClass"
            ></span>
            <span class="status-text">{{ pythonDiagnosticsText }}</span>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import {
  LATEX_BUILD_RECIPE_OPTIONS,
  formatLatexBuildRecipeLabel,
  useLatexStore,
} from '../../stores/latex'
import { usePythonStore } from '../../stores/python'
import { useI18n } from '../../i18n'
import UiSelect from '../shared/ui/UiSelect.vue'

const latexStore = useLatexStore()
const pythonStore = usePythonStore()
const { t } = useI18n()

const latexBuildRecipeOptions = computed(() =>
  LATEX_BUILD_RECIPE_OPTIONS.map((value) => ({
    value,
    label: formatLatexBuildRecipeLabel(value, t),
  }))
)
const compilerOptions = computed(() => [
  { value: 'auto', label: t('Auto (prefer System TeX)') },
  { value: 'system', label: t('System TeX (latexmk)') },
  { value: 'tectonic', label: t('Tectonic') },
])
const engineOptions = computed(() => [
  { value: 'auto', label: t('Auto') },
  { value: 'xelatex', label: 'XeLaTeX' },
  { value: 'pdflatex', label: 'pdfLaTeX' },
  { value: 'lualatex', label: 'LuaLaTeX' },
])
const pythonInterpreterOptions = computed(() => {
  const options = [
    {
      value: 'auto',
      label: t('Auto'),
      triggerLabel: t('Auto'),
    },
  ]

  for (const runtime of pythonStore.availableInterpreters) {
    const runtimePath = String(runtime?.path || '').trim()
    if (!runtimePath) continue

    const versionLabel = runtime?.version ? `Python ${runtime.version}` : t('Python')

    options.push({
      value: runtimePath,
      label: versionLabel,
      triggerLabel: versionLabel,
    })
  }

  if (
    pythonStore.interpreterPreference !== 'auto'
    && !options.some((option) => option.value === pythonStore.interpreterPreference)
  ) {
    options.push({
      value: pythonStore.interpreterPreference,
      label: `${t('Unavailable interpreter')} · ${pythonStore.interpreterPreference}`,
      triggerLabel: t('Unavailable interpreter'),
    })
  }

  return options
})

const compilerPreference = computed({
  get: () => latexStore.compilerPreference,
  set: (value) => latexStore.setCompilerPreference(value),
})
const enginePreference = computed({
  get: () => latexStore.enginePreference,
  set: (value) => latexStore.setEnginePreference(value),
})
const buildRecipe = computed({
  get: () => latexStore.buildRecipe,
  set: (value) => latexStore.setBuildRecipe(value),
})
const pythonInterpreterPreference = computed({
  get: () => pythonStore.interpreterPreference,
  set: (value) => pythonStore.setInterpreterPreference(value),
})

const pythonDiagnosticsDotClass = computed(() => {
  if (pythonStore.hasInterpreter) return 'is-good'
  if (pythonStore.detectedInterpreterCount > 0) return 'is-none'
  return 'is-none'
})

const pythonDiagnosticsText = computed(() => {
  if (pythonStore.hasInterpreter) {
    return pythonStore.interpreter.version
      ? `Python ${pythonStore.interpreter.version}`
      : t('Selected')
  }

  if (
    pythonStore.interpreterPreference !== 'auto'
    && pythonStore.detectedInterpreterCount > 0
  ) {
    return t('Unavailable')
  }

  return pythonStore.detectedInterpreterCount > 0
    ? t('Available')
    : t('Not found')
})

const isRefreshingDiagnostics = computed(
  () =>
    pythonStore.checkingInterpreter
    || latexStore.checkingCompilers
    || latexStore.checkingTools,
)

async function redetectSystem() {
  await Promise.all([
    pythonStore.checkInterpreter(true),
    latexStore.checkCompilers(true),
    latexStore.checkTools(true),
  ])
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.requestAnimationFrame(() => {
      Promise.all([
        pythonStore.hydratePreferences(),
        pythonStore.checkInterpreter(),
        latexStore.checkCompilers(),
        latexStore.checkTools(),
      ]).catch(() => {})
    })
  }
})
</script>

<style scoped>
.settings-group-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.settings-group-title {
  text-transform: none;
  letter-spacing: 0.02em;
}

.is-disabled-row {
  opacity: 0.5;
  pointer-events: none;
}

.diagnostics-refresh-btn {
  appearance: none;
  border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  background: var(--surface-base);
  color: var(--text-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 6px;
  transition:
    background-color 0.15s,
    border-color 0.15s,
    color 0.15s;
}

.diagnostics-refresh-btn:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--text-primary);
  border-color: var(--border);
}

.diagnostics-refresh-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.diagnostics-refresh-label {
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
}

.diagnostics-spinner {
  width: 12px;
  height: 12px;
  border: 1.5px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 诊断项内的样式对齐 */
.diagnostic-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.status-dot.is-good {
  background: var(--success);
}
.status-dot.is-none {
  background: var(--border-strong);
}

.status-text {
  font-size: 13px;
  color: var(--text-muted);
}

@media (max-width: 720px) {
  .settings-group-heading {
    align-items: flex-start;
  }

  .diagnostics-refresh-label {
    display: none;
  }
}

.text-error {
  color: var(--error);
}

.diagnostic-action-btn {
  background: var(--surface-base);
  border: 1px solid var(--border-strong);
  color: var(--text-primary);
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.1s;
}
.diagnostic-action-btn:hover {
  background: var(--surface-hover);
}
</style>
