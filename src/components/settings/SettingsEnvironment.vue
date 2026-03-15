<template>
  <div>
    <h3 class="settings-section-title">{{ t('System') }}</h3>
    <p class="settings-hint">{{ t('System tools and compilers detected on your machine.') }}</p>

    <div class="env-languages">
      <div v-for="lang in envLanguages" :key="lang.key" class="env-lang-card">
        <div class="env-lang-header">
          <span class="env-lang-dot" :class="envLangDotClass(lang)"></span>
          <span class="env-lang-name">{{ lang.label }}</span>
          <span v-if="lang.info.found" class="env-lang-version">{{ lang.info.version || '' }}</span>
          <span v-else class="env-lang-missing">{{ t('Not found') }}</span>
        </div>

        <div v-if="lang.info.found" class="env-lang-details">
          <div v-if="lang.key !== 'python'" class="env-lang-path">{{ lang.info.path }}</div>
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

              <div class="env-inline-row env-inline-row-compact env-inline-row-offset">
                <div class="env-input-shell env-input-shell-slim">
                  <input
                    v-model="customPythonPathDraft"
                    class="env-path-input"
                    :placeholder="t('Conda / venv Python path')"
                  />
                </div>
                <button class="env-install-btn" type="button" @click="saveCustomPythonPath">
                  {{ t('Use Path') }}
                </button>
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

        <div v-else class="env-lang-hint">{{ envStore.installHint(lang.key) }}</div>
        <template v-if="lang.key === 'python' && !lang.info.found">
          <div class="env-inline-row env-inline-row-compact env-inline-row-missing">
            <div class="env-input-shell env-input-shell-slim">
              <input
                v-model="customPythonPathDraft"
                class="env-path-input"
                :placeholder="t('Custom Python path')"
              />
            </div>
            <button class="env-install-btn" type="button" @click="saveCustomPythonPath">
              {{ t('Use Path') }}
            </button>
          </div>
        </template>

        <div v-if="envStore.lastInstallLanguage === lang.key && envStore.installError" class="env-install-error">
          {{ envStore.installError }}
        </div>
      </div>
    </div>

    <div class="env-actions">
      <button class="env-redetect-btn" :disabled="envStore.detecting || latexStore.checkingCompilers || typstStore.checkingCompiler || typstStore.downloading" @click="redetectSystem">
        {{ envStore.detecting || latexStore.checkingCompilers || typstStore.checkingCompiler || typstStore.downloading ? t('Checking...') : t('Re-detect') }}
      </button>
      <span v-if="!envStore.detected" class="env-hint-text">{{ t('Not yet detected') }}</span>
      <span v-else class="env-hint-text">{{ t('Last detected this session') }}</span>
    </div>

    <!-- LaTeX Compiler -->
    <h3 class="settings-section-title env-section-offset">{{ t('LaTeX Compiler') }}</h3>
    <p class="settings-hint">{{ t('Choose which compiler Altals uses for .tex files.') }}</p>

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
        <div class="env-lang-hint env-hint-inline">
          {{
            latexStore.compilerPreference === 'tectonic'
              ? t('Tectonic chooses its own engine behavior. This setting applies to System TeX only.')
              : t('Used when no % !TEX program = ... magic comment is present.')
          }}
        </div>
      </div>
    </div>

    <div class="env-lang-card">
      <div class="env-lang-header">
        <span class="env-lang-dot" :class="latexStore.systemTexInstalled ? 'good' : 'none'"></span>
        <span class="env-lang-name">{{ t('System TeX') }}</span>
        <span v-if="latexStore.systemTexInstalled" class="env-lang-version">{{ t('Installed') }}</span>
        <span v-else class="env-lang-missing">{{ t('Not found') }}</span>
      </div>
      <div v-if="latexStore.systemTexInstalled" class="env-lang-details">
        <div class="env-lang-path">{{ latexStore.systemTexPath }}</div>
      </div>
      <div class="env-lang-hint env-hint-inline">
        {{ t('Use your MacTeX / TeX Live installation through latexmk.') }}
      </div>
      <div class="env-action-row env-action-row-stack">
        <div class="env-input-shell env-input-shell-slim env-input-shell-grow">
          <input
            v-model="customSystemTexPathDraft"
            class="env-path-input"
            :placeholder="t('Custom latexmk path')"
          />
        </div>
        <button class="env-install-btn" type="button" @click="saveCustomSystemTexPath">
          {{ t('Use Path') }}
        </button>
      </div>
    </div>

    <div class="env-lang-card">
      <template v-if="latexStore.tectonicInstalled">
        <div class="env-lang-header">
          <span class="env-lang-dot good"></span>
          <span class="env-lang-name">Tectonic</span>
          <span class="env-lang-version">{{ t('Installed') }}</span>
        </div>
        <div class="env-lang-details">
          <div class="env-lang-path">{{ latexStore.tectonicPath }}</div>
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
        <div class="env-lang-hint env-hint-inline">
          {{ t('Use the built-in lightweight compiler when you do not want a full TeX distribution.') }}
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

    <h3 class="settings-section-title env-section-offset">{{ t('Typst Compiler') }}</h3>
    <p class="settings-hint">{{ t('Compile .typ files with the local Typst CLI.') }}</p>

    <div class="env-lang-card">
      <template v-if="typstStore.available">
        <div class="env-lang-header">
          <span class="env-lang-dot good"></span>
          <span class="env-lang-name">Typst</span>
          <span class="env-lang-version">{{ t('Installed') }}</span>
        </div>
        <div v-if="typstStore.compilerPath" class="env-lang-details">
          <div class="env-lang-path">{{ typstStore.compilerPath }}</div>
        </div>
        <div class="env-lang-hint env-hint-inline">
          {{ t('Use the Typst CLI to compile .typ files directly to PDF.') }}
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
        <div class="env-lang-hint env-hint-inline">
          {{ t('Typst compiles .typ files to PDF. A one-time download is required.') }}
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
      <div class="env-action-row env-action-row-stack">
        <div class="env-input-shell env-input-shell-slim env-input-shell-grow">
          <input
            v-model="customTypstPathDraft"
            class="env-path-input"
            :placeholder="t('Custom Typst path')"
          />
        </div>
        <button class="env-install-btn" type="button" @click="saveCustomTypstPath">
          {{ t('Use Path') }}
        </button>
      </div>
    </div>

  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useEnvironmentStore } from '../../stores/environment'
import { useLatexStore } from '../../stores/latex'
import { useTypstStore } from '../../stores/typst'
import { useI18n } from '../../i18n'

const envStore = useEnvironmentStore()
const latexStore = useLatexStore()
const typstStore = useTypstStore()
const { t } = useI18n()
const customPythonPathDraft = ref(envStore.customPythonPath || '')
const customSystemTexPathDraft = ref(latexStore.customSystemTexPath || '')
const customTypstPathDraft = ref(typstStore.customCompilerPath || '')

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

async function saveCustomPythonPath() {
  await envStore.saveCustomPythonPath(customPythonPathDraft.value)
}

async function saveCustomSystemTexPath() {
  await latexStore.setCustomSystemTexPath(customSystemTexPathDraft.value)
}

async function saveCustomTypstPath() {
  await typstStore.setCustomCompilerPath(customTypstPathDraft.value)
}

function onCompilerPreferenceChange(event) {
  latexStore.setCompilerPreference(event.target.value)
}

function onEnginePreferenceChange(event) {
  latexStore.setEnginePreference(event.target.value)
}

async function redetectSystem() {
  await Promise.all([
    envStore.detect(true),
    latexStore.checkCompilers(true),
    typstStore.checkCompiler(true),
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
    typstStore.checkCompiler(),
  ]))
}

watch(() => envStore.customPythonPath, (value) => {
  customPythonPathDraft.value = value || ''
})

watch(() => latexStore.customSystemTexPath, (value) => {
  customSystemTexPathDraft.value = value || ''
})

watch(() => typstStore.customCompilerPath, (value) => {
  customTypstPathDraft.value = value || ''
})

onMounted(() => {
  warmSystemChecks()
})
</script>

<style scoped>
.env-languages {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.env-lang-details {
  margin-top: 6px;
  padding-left: 16px;
}

.env-lang-path {
  font-size: var(--ui-font-micro);
  color: var(--fg-muted);
  font-family: var(--font-mono);
  margin-bottom: 10px;
}

.env-lang-kernel-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--ui-font-caption);
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
  gap: 10px;
  margin-top: 4px;
}

.env-compact-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.env-compact-block-offset {
  margin-top: 12px;
  padding-left: 16px;
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
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-primary);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  box-shadow: none;
  color: var(--fg-primary);
  font-size: var(--ui-font-caption);
  line-height: 1.2;
  padding: 8px 34px 8px 10px;
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
  padding: 8px;
  border-radius: 8px;
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
  padding: 8px 10px;
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
  margin-top: 8px;
}

.env-install-btn {
  padding: 2px 10px;
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
  margin: 10px 16px 0;
}

.env-install-btn-inline {
  margin-left: 8px;
}

.env-actions {
  margin-top: 16px;
  display: flex;
  align-items: center;
  gap: 10px;
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
  margin-top: 24px;
}

.env-hint-inline {
  margin-top: 4px;
  padding-left: 16px;
}

.env-progress-shell {
  margin: 10px 16px 4px;
}

.env-action-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 16px;
  margin-top: 10px;
}

.env-action-row-stack {
  align-items: stretch;
}

.env-input-shell-grow {
  flex: 1;
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
