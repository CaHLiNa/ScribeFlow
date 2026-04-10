<template>
  <div class="env-page settings-page">
    <h3 class="settings-section-title">{{ t('System') }}</h3>

    <section class="settings-group">
      <h4 class="settings-group-title">{{ t('Tooling Status') }}</h4>
      <div class="settings-group-body">
        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">Markdown</div>
            <div class="settings-row-hint">
              {{ t('Plain text editing and preview are available without extra setup.') }}
            </div>
          </div>
          <div class="settings-row-control">
            <span class="settings-status-badge is-good">{{ t('Built in') }}</span>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">Git</div>
            <div class="settings-row-hint">
              {{
                gitInstalled
                  ? gitPath || 'git'
                  : t('Git powers history, snapshots, and remote sync.')
              }}
            </div>
          </div>
          <div class="settings-row-control">
            <span class="settings-status-badge" :class="gitInstalled ? 'is-good' : 'is-muted'">
              {{ gitInstalled ? t('Installed') : t('Not found') }}
            </span>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('LaTeX Compiler') }}</div>
            <div class="settings-row-hint">{{ t('Choose System TeX or Tectonic below.') }}</div>
          </div>
          <div class="settings-row-control">
            <span
              class="settings-status-badge"
              :class="latexStore.hasAvailableCompiler ? 'is-good' : 'is-warn'"
            >
              {{
                latexStore.hasAvailableCompiler
                  ? latexStore.availableCompilerName
                  : t('Needs setup')
              }}
            </span>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Typst Compiler') }}</div>
            <div class="settings-row-hint">
              {{ t('Install Typst and Tinymist below for live preview and sync.') }}
            </div>
          </div>
          <div class="settings-row-control">
            <span
              class="settings-status-badge"
              :class="typstStore.available ? 'is-good' : 'is-warn'"
            >
              {{ typstStore.available ? t('Installed') : t('Needs setup') }}
            </span>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Detection') }}</div>
            <div class="settings-row-hint">
              {{
                !toolingChecked
                  ? t('Tooling has not been checked in this session yet.')
                  : t('Re-scan system tools and installed compilers.')
              }}
            </div>
          </div>
          <div class="settings-row-control">
            <UiButton
              variant="secondary"
              size="sm"
              :loading="
                gitChecking ||
                latexStore.checkingCompilers ||
                typstStore.checkingCompiler ||
                typstStore.downloading ||
                tinymistStore.checkingBinary ||
                tinymistStore.downloading
              "
              @click="redetectSystem"
            >
              {{
                gitChecking ||
                latexStore.checkingCompilers ||
                typstStore.checkingCompiler ||
                typstStore.downloading ||
                tinymistStore.checkingBinary ||
                tinymistStore.downloading
                  ? t('Checking...')
                  : t('Re-detect')
              }}
            </UiButton>
          </div>
        </div>
      </div>
    </section>

    <section class="settings-group">
      <h4 class="settings-group-title">{{ t('LaTeX') }}</h4>
      <div class="settings-group-body">
        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Compiler') }}</div>
            <div class="settings-row-hint">
              {{ t('Pick the preferred backend for LaTeX projects.') }}
            </div>
          </div>
          <div class="settings-row-control">
            <UiSelect
              v-model="compilerPreference"
              size="sm"
              shell-class="env-inline-select"
              :aria-label="t('Compiler')"
              :options="compilerOptions"
            />
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('LaTeX Engine') }}</div>
            <div class="settings-row-hint">
              {{ t('Used when the selected compiler supports engine selection.') }}
            </div>
          </div>
          <div class="settings-row-control">
            <UiSelect
              v-model="enginePreference"
              size="sm"
              shell-class="env-inline-select"
              :aria-label="t('LaTeX Engine')"
              :options="engineOptions"
              :disabled="latexStore.compilerPreference === 'tectonic'"
            />
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Build recipe') }}</div>
            <div class="settings-row-hint">
              {{ t('Choose the command sequence used for LaTeX builds.') }}
            </div>
          </div>
          <div class="settings-row-control">
            <UiSelect
              v-model="buildRecipe"
              size="sm"
              shell-class="env-inline-select"
              :aria-label="t('Build recipe')"
              :options="latexBuildRecipeOptions"
            />
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('System TeX') }}</div>
            <div class="settings-row-hint">
              {{ t('Uses the TeX distribution already installed on this Mac.') }}
            </div>
          </div>
          <div class="settings-row-control">
            <span
              class="settings-status-badge"
              :class="latexStore.systemTexInstalled ? 'is-good' : 'is-muted'"
            >
              {{ latexStore.systemTexInstalled ? t('Installed') : t('Not found') }}
            </span>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">Tectonic</div>
            <div class="settings-row-hint">
              {{
                latexStore.tectonicInstalled
                  ? t('Bundled Rust-based LaTeX compiler is ready to use.')
                  : latexStore.downloading
                    ? t('Downloading Tectonic… {progress}%', {
                        progress: latexStore.downloadProgress,
                      })
                    : t(
                        'Download Tectonic to run LaTeX without relying on a full TeX installation.'
                      )
              }}
            </div>
            <div v-if="latexStore.downloading" class="settings-progress">
              <div class="settings-progress-bar">
                <div
                  class="settings-progress-fill"
                  :style="{ width: latexStore.downloadProgress + '%' }"
                ></div>
              </div>
            </div>
            <div v-if="latexStore.downloadError" class="settings-row-error">
              {{ latexStore.downloadError }}
            </div>
          </div>
          <div class="settings-row-control">
            <span v-if="latexStore.tectonicInstalled" class="settings-status-badge is-good">
              {{ t('Installed') }}
            </span>
            <UiButton
              v-else
              variant="secondary"
              size="sm"
              :loading="latexStore.downloading"
              @click="latexStore.downloadTectonic()"
            >
              {{ latexStore.downloadError ? t('Retry') : t('Download') }}
            </UiButton>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">ChkTeX</div>
            <div class="settings-row-hint">
              {{ t('Optional linter used for LaTeX diagnostics.') }}
            </div>
          </div>
          <div class="settings-row-control">
            <span
              class="settings-status-badge"
              :class="latexStore.chktexInstalled ? 'is-good' : 'is-muted'"
            >
              {{ latexStore.chktexInstalled ? t('Installed') : t('Not found') }}
            </span>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">latexindent</div>
            <div class="settings-row-hint">
              {{ t('Optional formatter used for LaTeX format on save.') }}
            </div>
          </div>
          <div class="settings-row-control">
            <span
              class="settings-status-badge"
              :class="latexStore.latexindentInstalled ? 'is-good' : 'is-muted'"
            >
              {{ latexStore.latexindentInstalled ? t('Installed') : t('Not found') }}
            </span>
          </div>
        </div>
      </div>
    </section>

    <section class="settings-group">
      <h4 class="settings-group-title">Typst</h4>
      <div class="settings-group-body">
        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">Typst</div>
            <div class="settings-row-hint">
              {{
                typstStore.available
                  ? t('The Typst compiler is available for live preview and export.')
                  : typstStore.downloading
                    ? t('Downloading Typst… {progress}%', { progress: typstStore.downloadProgress })
                    : t('Download Typst to enable document builds and native preview.')
              }}
            </div>
            <div v-if="typstStore.downloading" class="settings-progress">
              <div class="settings-progress-bar">
                <div
                  class="settings-progress-fill"
                  :style="{ width: typstStore.downloadProgress + '%' }"
                ></div>
              </div>
            </div>
            <div v-if="typstStore.downloadError" class="settings-row-error">
              {{ typstStore.downloadError }}
            </div>
          </div>
          <div class="settings-row-control">
            <span v-if="typstStore.available" class="settings-status-badge is-good">
              {{ t('Installed') }}
            </span>
            <UiButton
              v-else
              variant="secondary"
              size="sm"
              :loading="typstStore.downloading"
              @click="typstStore.downloadTypst()"
            >
              {{ typstStore.downloadError ? t('Retry') : t('Download') }}
            </UiButton>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">Tinymist</div>
            <div class="settings-row-hint">
              {{
                tinymistStore.available
                  ? t('Language service is available for Typst diagnostics and editor assistance.')
                  : tinymistStore.downloading
                    ? t('Downloading Tinymist… {progress}%', {
                        progress: tinymistStore.downloadProgress,
                      })
                    : t('Download Tinymist to enable advanced Typst language features.')
              }}
            </div>
            <div v-if="tinymistStore.downloading" class="settings-progress">
              <div class="settings-progress-bar">
                <div
                  class="settings-progress-fill"
                  :style="{ width: tinymistStore.downloadProgress + '%' }"
                ></div>
              </div>
            </div>
            <div v-if="tinymistStore.downloadError" class="settings-row-error">
              {{ tinymistStore.downloadError }}
            </div>
          </div>
          <div class="settings-row-control">
            <span v-if="tinymistStore.available" class="settings-status-badge is-good">
              {{ t('Installed') }}
            </span>
            <UiButton
              v-else
              variant="secondary"
              size="sm"
              :loading="tinymistStore.downloading"
              @click="tinymistStore.downloadTinymist()"
            >
              {{ tinymistStore.downloadError ? t('Retry') : t('Download') }}
            </UiButton>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import {
  LATEX_BUILD_RECIPE_OPTIONS,
  formatLatexBuildRecipeLabel,
  useLatexStore,
} from '../../stores/latex'
import { useTinymistStore } from '../../stores/tinymist'
import { useTypstStore } from '../../stores/typst'
import { useI18n } from '../../i18n'
import UiButton from '../shared/ui/UiButton.vue'
import UiSelect from '../shared/ui/UiSelect.vue'

const latexStore = useLatexStore()
const tinymistStore = useTinymistStore()
const typstStore = useTypstStore()
const { t } = useI18n()
const gitInstalled = ref(false)
const gitPath = ref('')
const gitChecking = ref(false)
const toolingChecked = ref(false)

const latexBuildRecipeOptions = computed(() =>
  LATEX_BUILD_RECIPE_OPTIONS.map((value) => ({
    value,
    label: formatLatexBuildRecipeLabel(value, t),
  }))
)

const compilerOptions = computed(() => [
  { value: 'auto', label: t('Auto (prefer System TeX)') },
  { value: 'system', label: t('System TeX (latexmk)') },
  { value: 'tectonic', label: 'Tectonic' },
])

const engineOptions = computed(() => [
  { value: 'auto', label: t('Auto') },
  { value: 'xelatex', label: 'XeLaTeX' },
  { value: 'pdflatex', label: 'pdfLaTeX' },
  { value: 'lualatex', label: 'LuaLaTeX' },
])

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

async function detectGit() {
  if (gitChecking.value) return
  gitChecking.value = true
  try {
    const resolved = await invoke('resolve_command_path', { command: 'git' }).catch(() => '')
    gitPath.value = String(resolved || '').trim()
    gitInstalled.value = !!gitPath.value
    toolingChecked.value = true
  } finally {
    gitChecking.value = false
  }
}

async function redetectSystem() {
  await Promise.all([
    detectGit(),
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
  scheduleAfterFirstPaint(() =>
    Promise.all([
      detectGit(),
      latexStore.checkCompilers(),
      latexStore.checkTools(),
      typstStore.checkCompiler(),
      tinymistStore.checkBinary(),
    ])
  )
}

onMounted(() => {
  warmSystemChecks()
})
</script>

<style scoped>
.env-inline-select {
  min-width: 210px;
}

.settings-status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 22px;
  padding: 0 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: var(--font-weight-medium);
  color: color-mix(in srgb, var(--text-secondary) 88%, transparent);
  background: color-mix(in srgb, var(--surface-base) 16%, transparent);
}

.settings-status-badge.is-good {
  color: color-mix(in srgb, var(--success) 92%, black 8%);
  background: color-mix(in srgb, var(--success) 12%, transparent);
}

.settings-status-badge.is-warn {
  color: color-mix(in srgb, var(--warning) 88%, black 12%);
  background: color-mix(in srgb, var(--warning) 12%, transparent);
}

.settings-status-badge.is-muted {
  color: color-mix(in srgb, var(--text-secondary) 78%, transparent);
  background: color-mix(in srgb, var(--surface-base) 12%, transparent);
}

.settings-progress {
  margin-top: 8px;
}

.settings-progress-bar {
  width: min(280px, 100%);
  height: 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface-base) 60%, transparent);
  overflow: hidden;
}

.settings-progress-fill {
  height: 100%;
  border-radius: inherit;
  background: color-mix(in srgb, var(--accent) 72%, white 28%);
}

.settings-row-error {
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--error);
}
</style>
