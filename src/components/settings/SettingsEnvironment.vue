<template>
  <div class="env-page env-page-compact">
    <h3 class="settings-section-title">{{ t('System') }}</h3>

    <div class="env-languages">
      <div v-for="lang in envLanguages" :key="lang.key" class="env-lang-card" :class="envLangCardClass(lang)">
        <div class="env-lang-header">
          <span class="env-lang-dot" :class="envLangDotClass(lang)"></span>
          <span class="env-lang-name">{{ lang.label }}</span>
          <span v-if="lang.info.found" class="env-lang-version">{{ lang.info.version || '' }}</span>
          <span v-else class="env-lang-missing">{{ t('Not found') }}</span>
        </div>

        <div v-if="lang.info.found" class="env-lang-details">
          <template v-if="lang.key === 'python'">
            <div class="env-python-stack">
              <div v-if="lang.info.candidates?.length" class="env-compact-block">
                <div class="env-select-shell env-select-shell-full">
                  <select class="env-select" :value="lang.info.selectedPath || ''" @change="onPythonInterpreterChange">
                    <option v-for="candidate in lang.info.candidates" :key="candidate.path" :value="candidate.path">
                      {{ formatPythonCandidateTitle(candidate) }}
                    </option>
                  </select>
                  <span class="env-select-caret" aria-hidden="true">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                      <path d="M1 3l4 4 4-4z" />
                    </svg>
                  </span>
                </div>
              </div>

              <div class="env-lang-kernel-row env-lang-kernel-row-soft">
                <span>{{ t('Jupyter kernel') }}</span>
                <span v-if="kernelInstalledFor(lang)" class="env-kernel-badge env-kernel-yes">{{ t('Installed') }}</span>
                <template v-else>
                  <span class="env-kernel-badge env-kernel-no">{{ t('Not installed') }}</span>
                  <button
                    class="env-install-btn"
                    type="button"
                    :disabled="envStore.installing === lang.key"
                    @click="envStore.installKernel(lang.key)"
                  >
                    {{ envStore.installing === lang.key ? t('Installing...') : t('Install') }}
                  </button>
                </template>
              </div>

            </div>
          </template>
          <div v-else class="env-lang-kernel-row">
            <span>{{ t('Jupyter kernel') }}</span>
            <span v-if="kernelInstalledFor(lang)" class="env-kernel-badge env-kernel-yes">{{ t('Installed') }}</span>
            <template v-else>
              <span class="env-kernel-badge env-kernel-no">{{ t('Not installed') }}</span>
              <button
                class="env-install-btn"
                :disabled="envStore.installing === lang.key"
                @click="envStore.installKernel(lang.key)"
              >
                {{ envStore.installing === lang.key ? t('Installing...') : t('Install') }}
              </button>
            </template>
          </div>
        </div>

        <div v-if="envStore.lastInstallLanguage === lang.key && envStore.installError" class="env-install-error">
          {{ envStore.installError }}
        </div>
      </div>
    </div>

    <div class="env-actions">
      <button class="env-redetect-btn" :disabled="envStore.detecting || latexStore.checkingCompilers || typstStore.checkingCompiler || typstStore.downloading || tinymistStore.checkingBinary || tinymistStore.downloading" @click="redetectSystem">
        {{ envStore.detecting || latexStore.checkingCompilers || typstStore.checkingCompiler || typstStore.downloading || tinymistStore.checkingBinary || tinymistStore.downloading ? t('Checking...') : t('Re-detect') }}
      </button>
      <span v-if="!envStore.detected" class="env-hint-text">{{ t('Not yet detected') }}</span>
      <span v-else class="env-hint-text">{{ t('Last detected this session') }}</span>
    </div>

    <!-- LaTeX Compiler -->
    <h3 class="settings-section-title env-section-offset">{{ t('LaTeX Compiler') }}</h3>

    <div class="env-section-grid">
      <div class="env-lang-card">
        <div class="env-lang-header">
          <span class="env-lang-dot" :class="latexHeaderDotClass"></span>
          <span class="env-lang-name">{{ t('Compiler') }}</span>
          <span class="env-lang-version">{{ latexPreferenceLabel }}</span>
        </div>
        <div class="env-compact-block env-compact-block-offset">
          <div class="env-inline-row env-inline-row-top">
            <div class="env-select-shell">
              <select class="env-select" :value="latexStore.compilerPreference" @change="onCompilerPreferenceChange">
                <option value="auto">{{ t('Auto (prefer System TeX)') }}</option>
                <option value="system">{{ t('System TeX (latexmk)') }}</option>
                <option value="tectonic">Tectonic</option>
              </select>
              <span class="env-select-caret" aria-hidden="true">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                  <path d="M1 3l4 4 4-4z" />
                </svg>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div class="env-lang-card">
        <div class="env-lang-header">
          <span class="env-lang-dot" :class="latexEngineDotClass"></span>
          <span class="env-lang-name">{{ t('LaTeX Engine') }}</span>
          <span class="env-lang-version">{{ latexEngineLabel }}</span>
        </div>
        <div class="env-compact-block env-compact-block-offset">
          <div class="env-inline-row env-inline-row-top">
            <div class="env-select-shell">
              <select
                class="env-select"
                :value="latexStore.enginePreference"
                :disabled="latexStore.compilerPreference === 'tectonic'"
                @change="onEnginePreferenceChange"
              >
                <option value="auto">{{ t('Auto') }}</option>
                <option value="xelatex">XeLaTeX</option>
                <option value="pdflatex">pdfLaTeX</option>
                <option value="lualatex">LuaLaTeX</option>
              </select>
              <span class="env-select-caret" aria-hidden="true">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                  <path d="M1 3l4 4 4-4z" />
                </svg>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div class="env-lang-card env-card-span-full">
        <div class="env-lang-header">
          <span class="env-lang-dot" :class="latexBuildRecipeDotClass"></span>
          <span class="env-lang-name">{{ t('Build recipe') }}</span>
          <span class="env-lang-version">{{ latexStore.buildRecipeLabel }}</span>
        </div>
        <div class="env-compact-block env-compact-block-offset">
          <div class="env-inline-row env-inline-row-top">
            <div class="env-select-shell">
              <select class="env-select" :value="latexStore.buildRecipe" @change="onBuildRecipeChange">
                <option
                  v-for="option in latexBuildRecipeOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
              <span class="env-select-caret" aria-hidden="true">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                  <path d="M1 3l4 4 4-4z" />
                </svg>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div class="env-lang-card">
        <div class="env-lang-header">
          <span class="env-lang-dot" :class="latexStore.autoCompile ? 'good' : 'warn'"></span>
          <span class="env-lang-name">{{ t('Compile on save') }}</span>
          <span class="env-lang-version">{{ latexStore.autoCompile ? t('Enabled') : t('Disabled') }}</span>
          <div style="flex: 1;"></div>
          <button
            class="tool-toggle-switch"
            :class="{ on: latexStore.autoCompile }"
            @click="latexStore.setAutoCompile(!latexStore.autoCompile)"
          >
            <span class="tool-toggle-knob"></span>
          </button>
        </div>
      </div>

      <div class="env-lang-card">
        <div class="env-lang-header">
          <span class="env-lang-dot" :class="latexStore.formatOnSave ? 'good' : 'warn'"></span>
          <span class="env-lang-name">{{ t('Format on save') }}</span>
          <span class="env-lang-version">{{ latexStore.formatOnSave ? t('Enabled') : t('Disabled') }}</span>
          <div style="flex: 1;"></div>
          <button
            class="tool-toggle-switch"
            :class="{ on: latexStore.formatOnSave }"
            @click="latexStore.setFormatOnSave(!latexStore.formatOnSave)"
          >
            <span class="tool-toggle-knob"></span>
          </button>
        </div>
      </div>

      <div class="env-lang-card">
        <div class="env-lang-header">
          <span class="env-lang-dot" :class="latexStore.systemTexInstalled ? 'good' : 'none'"></span>
          <span class="env-lang-name">{{ t('System TeX') }}</span>
          <span v-if="latexStore.systemTexInstalled" class="env-lang-version">{{ t('Installed') }}</span>
          <span v-else class="env-lang-missing">{{ t('Not found') }}</span>
        </div>
      </div>

      <div class="env-lang-card">
        <template v-if="latexStore.tectonicInstalled">
          <div class="env-lang-header">
            <span class="env-lang-dot good"></span>
            <span class="env-lang-name">Tectonic</span>
            <span class="env-lang-version">{{ t('Installed') }}</span>
          </div>
        </template>

        <template v-else-if="latexStore.downloading">
          <div class="env-lang-header">
            <span class="env-lang-dot warn"></span>
            <span class="env-lang-name">Tectonic</span>
            <span class="env-lang-version">{{ t('Downloading... {progress}%', { progress: latexStore.downloadProgress }) }}</span>
          </div>
          <div class="tectonic-progress env-progress-shell">
            <div class="tectonic-progress-bar">
              <div class="tectonic-progress-fill" :style="{ width: latexStore.downloadProgress + '%' }"></div>
            </div>
          </div>
        </template>

        <template v-else>
          <div class="env-lang-header">
            <span class="env-lang-dot none"></span>
            <span class="env-lang-name">Tectonic</span>
            <span class="env-lang-missing">{{ t('Not installed') }}</span>
          </div>
          <div class="env-action-row">
            <button class="env-install-btn" @click="latexStore.downloadTectonic()">
              {{ t('Download Tectonic') }}
            </button>
          </div>
        </template>

        <div v-if="latexStore.downloadError" class="env-install-error env-install-error-inline">
          {{ latexStore.downloadError }}
          <button class="env-install-btn env-install-btn-inline" @click="latexStore.downloadTectonic()">
            {{ t('Retry') }}
          </button>
        </div>
      </div>
    </div>

    <h3 class="settings-section-title env-section-offset">{{ t('LaTeX Tools') }}</h3>

    <div class="env-section-grid">
      <div class="env-lang-card">
        <div class="env-lang-header">
          <span class="env-lang-dot" :class="latexStore.chktexInstalled ? 'good' : 'none'"></span>
          <span class="env-lang-name">ChkTeX</span>
          <span v-if="latexStore.chktexInstalled" class="env-lang-version">{{ t('Installed') }}</span>
          <span v-else class="env-lang-missing">{{ t('Not found') }}</span>
        </div>
      </div>

      <div class="env-lang-card">
        <div class="env-lang-header">
          <span class="env-lang-dot" :class="latexStore.latexindentInstalled ? 'good' : 'none'"></span>
          <span class="env-lang-name">latexindent</span>
          <span v-if="latexStore.latexindentInstalled" class="env-lang-version">{{ t('Installed') }}</span>
          <span v-else class="env-lang-missing">{{ t('Not found') }}</span>
        </div>
      </div>
    </div>

    <h3 class="settings-section-title env-section-offset">Typst</h3>

    <div class="env-section-grid">
      <div class="env-lang-card">
        <template v-if="typstStore.available">
          <div class="env-lang-header">
            <span class="env-lang-dot good"></span>
            <span class="env-lang-name">Typst</span>
            <span class="env-lang-version">{{ t('Installed') }}</span>
          </div>
        </template>

        <template v-else-if="typstStore.downloading">
          <div class="env-lang-header">
            <span class="env-lang-dot warn"></span>
            <span class="env-lang-name">Typst</span>
            <span class="env-lang-version">{{ t('Downloading... {progress}%', { progress: typstStore.downloadProgress }) }}</span>
          </div>
          <div class="tectonic-progress env-progress-shell">
            <div class="tectonic-progress-bar">
              <div class="tectonic-progress-fill" :style="{ width: typstStore.downloadProgress + '%' }"></div>
            </div>
          </div>
        </template>

        <template v-else>
          <div class="env-lang-header">
            <span class="env-lang-dot none"></span>
            <span class="env-lang-name">Typst</span>
            <span class="env-lang-missing">{{ t('Not installed') }}</span>
          </div>
          <div class="env-action-row">
            <button class="env-install-btn" @click="typstStore.downloadTypst()">
              {{ t('Download Typst') }}
            </button>
          </div>
        </template>

        <div v-if="typstStore.downloadError" class="env-install-error env-install-error-inline">
          {{ typstStore.downloadError }}
          <button class="env-install-btn env-install-btn-inline" @click="typstStore.downloadTypst()">
            {{ t('Retry') }}
          </button>
        </div>
      </div>

      <div class="env-lang-card">
        <template v-if="tinymistStore.available">
          <div class="env-lang-header">
            <span class="env-lang-dot good"></span>
            <span class="env-lang-name">Tinymist</span>
            <span class="env-lang-version">{{ t('Installed') }}</span>
          </div>
        </template>

        <template v-else-if="tinymistStore.downloading">
          <div class="env-lang-header">
            <span class="env-lang-dot warn"></span>
            <span class="env-lang-name">Tinymist</span>
            <span class="env-lang-version">{{ t('Downloading... {progress}%', { progress: tinymistStore.downloadProgress }) }}</span>
          </div>
          <div class="tectonic-progress env-progress-shell">
            <div class="tectonic-progress-bar">
              <div class="tectonic-progress-fill" :style="{ width: tinymistStore.downloadProgress + '%' }"></div>
            </div>
          </div>
        </template>

        <template v-else>
          <div class="env-lang-header">
            <span class="env-lang-dot none"></span>
            <span class="env-lang-name">Tinymist</span>
            <span class="env-lang-missing">{{ t('Not installed') }}</span>
          </div>
          <div class="env-action-row">
            <button class="env-install-btn" @click="tinymistStore.downloadTinymist()">
              {{ t('Download Tinymist') }}
            </button>
          </div>
        </template>

        <div v-if="tinymistStore.downloadError" class="env-install-error env-install-error-inline">
          {{ tinymistStore.downloadError }}
          <button class="env-install-btn env-install-btn-inline" @click="tinymistStore.downloadTinymist()">
            {{ t('Retry') }}
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useEnvironmentStore } from '../../stores/environment'
import { LATEX_BUILD_RECIPE_OPTIONS, formatLatexBuildRecipeLabel, useLatexStore } from '../../stores/latex'
import { useTinymistStore } from '../../stores/tinymist'
import { useTypstStore } from '../../stores/typst'
import { useI18n } from '../../i18n'

const envStore = useEnvironmentStore()
const latexStore = useLatexStore()
const tinymistStore = useTinymistStore()
const typstStore = useTypstStore()
const { t } = useI18n()

const envLanguages = computed(() => [
  { key: 'python', label: 'Python', info: envStore.languages.python },
  { key: 'r', label: 'R', info: envStore.languages.r },
  { key: 'julia', label: 'Julia', info: envStore.languages.julia },
])

const latexPreferenceLabel = computed(() => {
  if (latexStore.compilerPreference === 'system') return t('System TeX (latexmk)')
  if (latexStore.compilerPreference === 'tectonic') return 'Tectonic'
  return t('Auto (prefer System TeX)')
})

const latexHeaderDotClass = computed(() => {
  if (latexStore.compilerPreference === 'system') return latexStore.systemTexInstalled ? 'good' : 'none'
  if (latexStore.compilerPreference === 'tectonic') return latexStore.tectonicInstalled ? 'good' : 'none'
  return latexStore.systemTexInstalled || latexStore.tectonicInstalled ? 'good' : 'warn'
})

const latexEngineLabel = computed(() => {
  if (latexStore.enginePreference === 'xelatex') return 'XeLaTeX'
  if (latexStore.enginePreference === 'pdflatex') return 'pdfLaTeX'
  if (latexStore.enginePreference === 'lualatex') return 'LuaLaTeX'
  return t('Auto')
})

const latexEngineDotClass = computed(() => {
  if (latexStore.compilerPreference === 'tectonic') return 'warn'
  if (latexStore.compilerPreference === 'system') return latexStore.systemTexInstalled ? 'good' : 'none'
  return latexStore.systemTexInstalled ? 'good' : 'warn'
})

const latexBuildRecipeDotClass = computed(() => {
  if (latexStore.compilerPreference === 'tectonic') return 'warn'
  if (latexStore.compilerPreference === 'system') return latexStore.systemTexInstalled ? 'good' : 'none'
  return latexStore.systemTexInstalled ? 'good' : 'warn'
})

const latexBuildRecipeOptions = computed(() => (
  LATEX_BUILD_RECIPE_OPTIONS.map(value => ({
    value,
    label: formatLatexBuildRecipeLabel(value, t),
  }))
))

function envLangCardClass(lang) {
  return {
    'env-card-span-full': lang.key === 'python' && lang.info.found,
  }
}

function envLangDotClass(lang) {
  if (kernelInstalledFor(lang)) return 'good'
  if (lang.info.found) return 'warn'
  return 'none'
}

function kernelInstalledFor(lang) {
  return lang.key === 'python' ? lang.info.selectedHasKernel : lang.info.hasKernel
}

function formatPythonCandidateTitle(candidate) {
  if (!candidate) return 'Python'
  const version = candidate.version ? `Python ${candidate.version}` : 'Python'
  const kernel = candidate.has_ipykernel ? t('Installed') : t('Not installed')
  return `${version} · ${kernel}`
}

async function onPythonInterpreterChange(event) {
  await envStore.selectPythonInterpreter(event.target.value)
}

function onCompilerPreferenceChange(event) {
  latexStore.setCompilerPreference(event.target.value)
}

function onEnginePreferenceChange(event) {
  latexStore.setEnginePreference(event.target.value)
}

function onBuildRecipeChange(event) {
  latexStore.setBuildRecipe(event.target.value)
}

async function redetectSystem() {
  await Promise.all([
    envStore.detect(true),
    latexStore.checkCompilers(true),
    latexStore.checkTools(true),
    typstStore.checkCompiler(true),
    tinymistStore.checkBinary(true),
  ])
}

function scheduleAfterFirstPaint(task) {
  const run = () => {
    Promise.resolve(task()).catch(() => {})
  }

  if (typeof window !== 'undefined') {
    window.requestAnimationFrame(() => {
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(run, { timeout: 600 })
      } else {
        window.setTimeout(run, 80)
      }
    })
    return
  }

  run()
}

function warmSystemChecks() {
  scheduleAfterFirstPaint(() => Promise.all([
    envStore.detect(),
    latexStore.checkCompilers(),
    latexStore.checkTools(),
    typstStore.checkCompiler(),
    tinymistStore.checkBinary(),
  ]))
}

onMounted(() => {
  warmSystemChecks()
})
</script>

<style scoped>
.env-languages {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.env-section-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.env-card-span-full {
  grid-column: 1 / -1;
}

.env-lang-card {
  padding: 8px 10px;
}

.env-lang-header {
  min-height: 24px;
}

.env-lang-name {
  font-size: var(--ui-font-label);
}

.env-lang-version,
.env-lang-missing {
  font-size: var(--ui-font-micro);
}

.env-lang-details {
  margin-top: 4px;
  padding-left: 22px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.env-lang-path {
  font-size: var(--ui-font-micro);
  color: var(--fg-muted);
  font-family: var(--font-mono);
  margin-bottom: 0;
  line-height: 1.45;
}

.env-lang-kernel-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--ui-font-micro);
  color: var(--fg-secondary);
  flex-wrap: wrap;
}

.env-control-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0.01)),
    var(--bg-secondary);
}

.env-control-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.env-control-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.env-control-label {
  font-size: var(--ui-font-caption);
  color: var(--fg-secondary);
}

.env-python-stack {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 0;
}

.env-compact-block {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.env-compact-block-offset {
  margin-top: 8px;
  padding-left: 22px;
}

.env-inline-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.env-inline-row-top {
  justify-content: space-between;
}

.env-inline-row-compact {
  align-items: stretch;
}

.env-inline-row-missing {
  margin-top: 10px;
  padding-left: 16px;
}

.env-select-shell {
  position: relative;
  min-width: min(320px, 100%);
  flex: 1;
}

.env-select-shell-full {
  width: 100%;
  min-width: 0;
}

.env-select {
  appearance: none;
  -webkit-appearance: none;
  width: 100%;
  min-width: 0;
  border-radius: 7px;
  border: 1px solid var(--border);
  background: var(--bg-primary);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  box-shadow: none;
  color: var(--fg-primary);
  font-size: var(--ui-font-caption);
  line-height: 1.2;
  padding: 6px 30px 6px 9px;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.env-select:hover {
  border-color: rgba(255, 255, 255, 0.14);
  background: color-mix(in srgb, var(--bg-primary) 92%, white);
}

.env-select:focus {
  outline: none;
  border-color: var(--accent);
}

.env-select-caret {
  position: absolute;
  top: 50%;
  right: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--fg-muted);
  pointer-events: none;
  transform: translateY(-50%);
}

.env-input-shell {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 9px;
  border-radius: 7px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.02);
}

.env-path-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--fg-primary);
  font-size: var(--ui-font-caption);
  padding: 0;
}

.env-path-input:focus {
  outline: none;
}

.env-input-shell:focus-within {
  border-color: var(--accent);
}

.env-input-shell-slim {
  flex: 1;
  min-width: min(260px, 100%);
  padding: 7px 9px;
}

.env-kernel-badge {
  font-size: var(--ui-font-micro);
  padding: 1px 6px;
  border-radius: 8px;
  font-weight: 500;
}

.env-kernel-yes {
  background: rgba(80, 250, 123, 0.1);
  color: var(--success, #50fa7b);
}

.env-kernel-no {
  background: rgba(226, 185, 61, 0.1);
  color: var(--warning, #e2b93d);
}

.env-lang-kernel-row-soft {
  padding-top: 2px;
}

.env-inline-row-offset {
  margin-top: 6px;
}

.env-install-btn {
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid var(--accent);
  background: rgba(122, 162, 247, 0.1);
  color: var(--accent);
  font-size: var(--ui-font-micro);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.env-install-btn:hover {
  background: rgba(122, 162, 247, 0.2);
}

.env-install-btn:disabled {
  opacity: 0.5;
  cursor: wait;
}

.env-install-error {
  margin-top: 6px;
  padding: 4px 8px;
  border-radius: 4px;
  background: rgba(247, 118, 142, 0.1);
  color: var(--error);
  font-size: var(--ui-font-micro);
}

.env-install-error-inline {
  margin: 8px 0 0 22px;
}

.env-install-btn-inline {
  margin-left: 8px;
}

.env-actions {
  margin-top: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.env-redetect-btn {
  padding: 5px 14px;
  border-radius: 5px;
  border: 1px solid var(--border);
  background: var(--bg-primary);
  color: var(--fg-secondary);
  font-size: var(--ui-font-caption);
  cursor: pointer;
  transition: all 0.15s;
}

.env-redetect-btn:hover {
  border-color: var(--fg-muted);
  color: var(--fg-primary);
}

.env-redetect-btn:disabled {
  opacity: 0.5;
  cursor: wait;
}

.env-hint-text {
  font-size: var(--ui-font-micro);
  color: var(--fg-muted);
}

.env-section-offset {
  margin-top: 20px;
}

.env-hint-inline {
  margin-top: 3px;
  padding-left: 22px;
  line-height: 1.45;
}

.env-progress-shell {
  margin: 8px 0 2px 22px;
}

.env-action-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 22px;
  margin-top: 8px;
}

.env-action-row-between {
  justify-content: space-between;
}

.env-action-row-stack {
  align-items: stretch;
}

.env-input-shell-grow {
  flex: 1;
}

.env-toggle-copy {
  font-size: var(--ui-font-caption);
  color: var(--fg-secondary);
  line-height: 1.4;
}

.tectonic-progress-bar {
  height: 4px;
  border-radius: 2px;
  background: var(--bg-primary);
  overflow: hidden;
}

.tectonic-progress-fill {
  height: 100%;
  background: var(--accent);
  transition: width 0.2s ease;
}

/* Stronger compact overrides so shared settings styles do not visually win. */
.env-page-compact .settings-section-title {
  margin-bottom: 12px;
}

.env-page-compact .settings-hint {
  margin: -6px 0 12px;
}

.env-page-compact .env-languages,
.env-page-compact .env-section-grid {
  gap: 6px;
}

.env-page-compact .env-lang-card {
  padding: 6px 8px;
  border-radius: 6px;
}

.env-page-compact .env-lang-header {
  gap: 6px;
  min-height: 20px;
}

.env-page-compact .env-lang-name {
  font-size: var(--ui-font-caption);
  font-weight: 600;
}

.env-page-compact .env-lang-version,
.env-page-compact .env-lang-missing {
  font-size: var(--ui-font-micro);
}

.env-page-compact .env-lang-details,
.env-page-compact .env-hint-inline,
.env-page-compact .env-action-row,
.env-page-compact .env-compact-block-offset {
  padding-left: 14px;
}

.env-page-compact .env-lang-details {
  margin-top: 3px;
  gap: 4px;
}

.env-page-compact .env-lang-hint {
  margin-top: 3px;
  line-height: 1.35;
}

.env-page-compact .env-lang-path {
  line-height: 1.35;
}

.env-page-compact .env-python-stack {
  gap: 4px;
}

.env-page-compact .env-lang-kernel-row {
  gap: 6px;
}

.env-page-compact .env-select {
  padding: 5px 28px 5px 8px;
  font-size: var(--ui-font-micro);
}

.env-page-compact .env-input-shell,
.env-page-compact .env-input-shell-slim {
  padding: 6px 8px;
}

.env-page-compact .env-redetect-btn {
  padding: 4px 12px;
}

.env-page-compact .env-actions {
  margin-top: 12px;
}

.env-page-compact .env-section-offset {
  margin-top: 16px;
}

.env-page-compact .env-progress-shell {
  margin: 6px 0 2px 14px;
}

.env-page-compact .env-install-error-inline {
  margin: 6px 0 0 14px;
}

@media (max-width: 620px) {
  .env-languages,
  .env-section-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 720px) {
  .env-inline-row-top {
    align-items: stretch;
  }

  .env-select-shell {
    min-width: 100%;
  }

  .env-input-shell {
    flex-direction: column;
    align-items: stretch;
  }

  .env-input-shell .env-install-btn,
  .env-action-row .env-install-btn {
    width: 100%;
  }
}
</style>
