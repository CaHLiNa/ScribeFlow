<template>
  <div class="env-page settings-page">
    <h3 class="settings-section-title">{{ t('System') }}</h3>

    <section class="settings-group">
      <h4 class="settings-group-title">{{ t('LaTeX Tooling') }}</h4>
      <div class="settings-group-body">
        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Active compiler') }}</div>
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
            <div class="settings-row-title">{{ t('System check') }}</div>
            <div class="settings-row-hint">
              {{
                !toolingChecked
                  ? t('Tooling has not been checked in this session yet.')
                  : t('Re-scan LaTeX tools installed on this Mac.')
              }}
            </div>
          </div>
          <div class="settings-row-control">
            <UiButton
              variant="secondary"
              size="sm"
              :loading="latexStore.checkingCompilers"
              @click="redetectSystem"
            >
              {{ latexStore.checkingCompilers ? t('Checking...') : t('Re-detect') }}
            </UiButton>
          </div>
        </div>

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
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import {
  LATEX_BUILD_RECIPE_OPTIONS,
  formatLatexBuildRecipeLabel,
  useLatexStore,
} from '../../stores/latex'
import { useI18n } from '../../i18n'
import UiButton from '../shared/ui/UiButton.vue'
import UiSelect from '../shared/ui/UiSelect.vue'

const latexStore = useLatexStore()
const { t } = useI18n()
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

async function redetectSystem() {
  toolingChecked.value = true
  await Promise.all([latexStore.checkCompilers(true), latexStore.checkTools(true)])
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
  scheduleAfterFirstPaint(async () => {
    toolingChecked.value = true
    await Promise.all([latexStore.checkCompilers(), latexStore.checkTools()])
  })
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
