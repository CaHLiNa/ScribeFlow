<template>
  <div>
    <h3 class="settings-section-title">{{ t('Usage') }}</h3>

    <!-- Month navigation -->
    <div class="month-nav">
      <UiButton
        class="month-nav-btn"
        variant="secondary"
        size="icon-sm"
        @click="usageStore.navigateMonth(-1)"
      >
        <IconChevronLeft :size="16" :stroke-width="1.5" />
      </UiButton>
      <span class="month-nav-label">{{ usageStore.selectedMonthLabel }}</span>
      <UiButton
        class="month-nav-btn"
        variant="secondary"
        size="icon-sm"
        :disabled="usageStore.isCurrentMonth"
        @click="usageStore.navigateMonth(1)"
      >
        <IconChevronRight :size="16" :stroke-width="1.5" />
      </UiButton>
      <UiButton
        v-if="!usageStore.isCurrentMonth"
        class="month-nav-current"
        variant="secondary"
        size="sm"
        @click="usageStore.goToCurrentMonth()"
      >
        {{ t('Current month') }}
      </UiButton>
    </div>

    <!-- Daily chart for selected month -->
    <template v-if="chartData.length > 0">
      <div class="chart-container" ref="chartEl">
        <svg
          :viewBox="`0 0 ${svgWidth} ${svgHeight}`"
          class="usage-chart"
          preserveAspectRatio="xMidYMid meet"
        >
          <!-- Gridlines -->
          <line
            v-for="(g, i) in chart.gridlines"
            :key="'grid-' + i"
            :x1="g.x1"
            :y1="g.y"
            :x2="g.x2"
            :y2="g.y"
            class="chart-gridline"
          />
          <!-- Baseline -->
          <line
            :x1="chart.baseline.x1"
            :y1="chart.baseline.y"
            :x2="chart.baseline.x2"
            :y2="chart.baseline.y"
            class="chart-baseline"
          />
          <!-- Y-axis labels -->
          <text
            v-for="(t, i) in chart.yTicks"
            :key="'y-' + i"
            :x="t.x"
            :y="t.y + 3"
            class="chart-y-label"
            text-anchor="end"
          >
            {{ t.label }}
          </text>
          <!-- Bars -->
          <g
            v-for="bar in chart.bars"
            :key="bar.date"
            class="chart-bar-group"
            :class="{ 'is-today': bar.isToday }"
            @mouseenter="showTooltip(bar, $event)"
            @mousemove="moveTooltip($event)"
            @mouseleave="hideTooltip()"
          >
            <!-- Invisible hit area for hover -->
            <rect
              :x="bar.x"
              :y="chart.plotArea.y"
              :width="bar.width"
              :height="chart.plotArea.height"
              fill="transparent"
            />
            <!-- Today marker — small accent line at baseline -->
            <rect
              v-if="bar.isToday"
              :x="bar.x"
              :y="chart.baseline.y - 1"
              :width="bar.width"
              :height="2"
              class="chart-today-marker"
            />
            <!-- Hosted segment (bottom) -->
            <rect
              v-if="bar.hostedH > 0"
              :x="bar.x"
              :y="bar.hostedY"
              :width="bar.width"
              :height="bar.hostedH"
              class="chart-bar-shoulders"
              rx="1.5"
            />
            <!-- Direct segment (stacked on top) -->
            <rect
              v-if="bar.directH > 0"
              :x="bar.x"
              :y="bar.directY"
              :width="bar.width"
              :height="bar.directH"
              class="chart-bar-direct"
              rx="1.5"
            />
          </g>
          <!-- X-axis labels -->
          <text
            v-for="(l, i) in chart.xLabels"
            :key="'x-' + i"
            :x="l.x"
            :y="l.y"
            class="chart-x-label"
            :class="{ 'is-today': l.isToday }"
            text-anchor="middle"
          >
            {{ l.text }}
          </text>
        </svg>
        <!-- HTML tooltip -->
        <div
          v-if="tooltip"
          class="chart-tooltip"
          :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }"
        >
          <div class="chart-tooltip-date">{{ tooltip.dateLabel }}</div>
          <div v-if="tooltip.direct > 0" class="chart-tooltip-row">
            <span class="chart-tooltip-swatch swatch-direct"></span>
            {{ t('API keys') }}: ~{{ tooltip.directLabel }}
          </div>
          <div v-if="tooltip.direct > 0" class="chart-tooltip-total">
            {{ t('Estimated cost:') }} {{ tooltip.totalLabel }}
          </div>
          <div v-if="tooltip.calls > 0" class="chart-tooltip-calls">
            {{ tooltip.calls }} {{ t('calls') }}
          </div>
        </div>
        <!-- Legend -->
        <div class="chart-legend">
          <span v-if="showDirect" class="chart-legend-item">
            <span class="chart-legend-swatch swatch-direct"></span> {{ t('API keys')
            }}{{ usageStore.showCostEstimates ? ` (${t('est.')})` : '' }}
          </span>
        </div>
      </div>
    </template>

    <!-- API Keys section -->
    <template v-if="showDirect">
      <div class="usage-source-section">
        <div class="usage-source-header">
          <span class="usage-source-title">{{ t('Your API keys') }}</span>
        </div>
        <div class="usage-source-disclaimer">
          {{ t('Estimated from published rates. Check provider dashboards for actual charges.') }}
        </div>

        <!-- Summary line -->
        <div v-if="usageStore.directCalls > 0" class="usage-summary-line">
          <template v-if="usageStore.showCostEstimates && usageStore.directCost > 0">
            <span>~{{ formatCost(usageStore.directCost) }} {{ t('est.') }}</span>
            <span class="usage-sep"> · </span>
          </template>
          <span>{{ usageStore.directCalls.toLocaleString() }} {{ t('calls') }}</span>
          <span v-if="directTotalTokens > 0" class="usage-sep"> · </span>
          <span v-if="directTotalTokens > 0"
            >{{ formatTokens(directTotalTokens) }} {{ t('Tokens') }}</span
          >
        </div>
        <div v-else class="usage-empty-hint">{{ t('No API key usage this month.') }}</div>

        <!-- Breakdown table with toggle -->
        <template v-if="directRows.length > 0">
          <div class="usage-breakdown-tabs settings-segmented">
            <UiButton
              class="usage-breakdown-tab settings-segmented-btn"
              variant="ghost"
              size="sm"
              :active="directView === 'feature'"
              @click="directView = 'feature'"
            >
              {{ t('By feature') }}
            </UiButton>
            <UiButton
              class="usage-breakdown-tab settings-segmented-btn"
              variant="ghost"
              size="sm"
              :active="directView === 'model'"
              @click="directView = 'model'"
            >
              {{ t('By model') }}
            </UiButton>
          </div>
          <div class="usage-table">
            <div class="usage-table-header" :style="{ gridTemplateColumns: directGridCols }">
              <span class="usage-col-name">{{
                directView === 'feature' ? t('Feature') : t('Model')
              }}</span>
              <span v-if="usageStore.showCostEstimates" class="usage-col-num">{{
                t('~Cost')
              }}</span>
              <span class="usage-col-num">{{ t('Tokens') }}</span>
              <span class="usage-col-num">{{ t('calls') }}</span>
            </div>
            <div
              v-for="row in directRows"
              :key="row.name"
              class="usage-table-row"
              :style="{ gridTemplateColumns: directGridCols }"
            >
              <span
                class="usage-col-name"
                :class="directView === 'model' ? 'usage-model-name' : 'usage-feature-name'"
                >{{ row.name }}</span
              >
              <span v-if="usageStore.showCostEstimates" class="usage-col-num">{{
                row.direct_cost > 0 ? '~' + formatCost(row.direct_cost) : '—'
              }}</span>
              <span class="usage-col-num">{{
                formatTokens(row.input_tokens + row.output_tokens)
              }}</span>
              <span class="usage-col-num">{{ row.calls }}</span>
            </div>
          </div>
        </template>
      </div>
    </template>

    <!-- Empty state -->
    <div v-if="!showDirect" class="usage-empty-state">
      {{ t('No usage data yet. Configure AI models in Settings > Models.') }}
    </div>

    <!-- Display section -->
    <h3 class="settings-section-title settings-usage-subtitle">{{ t('Display') }}</h3>

    <div class="display-toggles">
      <div class="env-lang-card">
        <div class="env-lang-header">
          <div>
            <span class="env-lang-name">{{ t('Show API key cost estimates') }}</span>
            <p class="settings-usage-inline-hint">
              {{ t('Actual charges may differ significantly. Check provider dashboards.') }}
            </p>
          </div>
          <div class="ui-flex-spacer"></div>
          <UiSwitch
            :model-value="usageStore.showCostEstimates"
            :aria-label="t('Toggle API key cost estimates')"
            @update:model-value="usageStore.setShowCostEstimates(!usageStore.showCostEstimates)"
          />
        </div>
      </div>

      <div class="env-lang-card settings-usage-display-card">
        <div class="env-lang-header">
          <span class="env-lang-name">{{ t('Show billing in footer') }}</span>
          <div class="ui-flex-spacer"></div>
          <UiSwitch
            :model-value="usageStore.showInFooter"
            :aria-label="t('Toggle billing in footer')"
            @update:model-value="usageStore.setShowInFooter(!usageStore.showInFooter)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-vue'
import { useUsageStore } from '../../stores/usage'
import { useWorkspaceStore } from '../../stores/workspace'
import { formatCost } from '../../services/tokenUsage'
import { computeChartLayout } from '../../utils/usageChart'
import { formatDate, useI18n } from '../../i18n'
import UiButton from '../shared/ui/UiButton.vue'
import UiSwitch from '../shared/ui/UiSwitch.vue'

const usageStore = useUsageStore()
const workspace = useWorkspaceStore()
const { t } = useI18n()

// View toggles (feature vs model) for each section
const directView = ref('feature')

// Chart uses a fixed viewBox coordinate system; CSS width: 100% handles responsive sizing
const svgWidth = 360
const svgHeight = 90
const chartEl = ref(null)

onMounted(() => {
  usageStore.loadMonth()
  usageStore.loadTrend()
  usageStore.loadDailyTrend()
})

// Tooltip state
const tooltip = ref(null)

function showTooltip(bar, event) {
  if (bar.totalCost <= 0 && bar.calls <= 0) return
  const container = chartEl.value
  if (!container) return
  const rect = container.getBoundingClientRect()
  const x = event.clientX - rect.left + 8
  const y = event.clientY - rect.top - 50
  const maxX = rect.width - 150
  tooltip.value = {
    x: Math.max(0, Math.min(x, maxX)),
    y: Math.max(0, y),
    dateLabel: formatDateShort(bar.date),
    direct: bar.directCost,
    directLabel: formatCost(bar.directCost),
    totalLabel: formatCost(bar.totalCost),
    calls: bar.calls,
  }
}

function moveTooltip(event) {
  if (!tooltip.value) return
  const container = chartEl.value
  if (!container) return
  const rect = container.getBoundingClientRect()
  const x = event.clientX - rect.left + 8
  const y = event.clientY - rect.top - 50
  const maxX = rect.width - 150
  tooltip.value.x = Math.max(0, Math.min(x, maxX))
  tooltip.value.y = Math.max(0, y)
}

function hideTooltip() {
  tooltip.value = null
}

// ─── Section visibility ────────────────────────────────────────────

const showDirect = computed(() => {
  const keys = workspace.apiKeys || {}
  const hasKeys = !!(keys.ANTHROPIC_API_KEY || keys.OPENAI_API_KEY || keys.GOOGLE_API_KEY)
  return hasKeys || usageStore.directCost > 0 || usageStore.directCalls > 0
})

const directFeatures = computed(() =>
  usageStore.byFeature.filter((r) => r.direct_cost > 0 || r.calls > 0)
)

const directModels = computed(() => usageStore.byModel.filter((r) => r.direct_cost > 0))

const directRows = computed(() =>
  directView.value === 'feature' ? directFeatures.value : directModels.value
)

const directTotalTokens = computed(() =>
  directFeatures.value.reduce((sum, r) => sum + (r.input_tokens || 0) + (r.output_tokens || 0), 0)
)

const directGridCols = computed(() => {
  const cols = ['1fr']
  if (usageStore.showCostEstimates) cols.push('80px')
  cols.push('70px', '60px')
  return cols.join(' ')
})

// ─── Daily chart ───────────────────────────────────────────────────

const chartData = computed(() => {
  const data = usageStore.dailyData
  if (!data.length) return []

  const dateMap = {}
  for (const d of data) dateMap[d.date] = d

  const [year, month] = usageStore.selectedMonth.split('-').map(Number)
  const daysInMonth = new Date(year, month, 0).getDate()
  const today = new Date()
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1
  const lastDay = isCurrentMonth ? today.getDate() : daysInMonth

  const todayStr = isCurrentMonth
    ? `${year}-${String(month).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    : null

  const result = []
  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const entry = dateMap[dateStr]
    result.push({
      date: dateStr,
      cost: entry?.cost || 0,
      shoulders_cost: entry?.shoulders_cost || 0,
      calls: entry?.calls || 0,
      isToday: dateStr === todayStr,
      dayNum: d,
    })
  }
  return result
})

const chart = computed(() => {
  return computeChartLayout(chartData.value, {
    width: svgWidth,
    height: svgHeight,
  })
})

// ─── Helpers ───────────────────────────────────────────────────────

function formatDateShort(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number)
  return formatDate(new Date(year, month - 1, day), { month: 'short', day: 'numeric' })
}

function formatTokens(n) {
  if (!n) return '0'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return String(n)
}
</script>

<style scoped>
/* Month navigation */
.month-nav {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 16px;
}

.month-nav-btn {
  flex-shrink: 0;
}

.month-nav-label {
  font-size: var(--ui-font-title);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  min-width: 160px;
  text-align: center;
}

.month-nav-current {
  margin-left: 8px;
}

/* Chart */
.chart-container {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 10px 14px 8px;
  background: var(--surface-base);
  margin-bottom: 4px;
  position: relative;
}

.usage-chart {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
}

/* SVG chart elements */
.chart-gridline {
  stroke: var(--border-subtle);
  stroke-width: 0.5;
  opacity: 0.5;
}

.chart-baseline {
  stroke: var(--border-subtle);
  stroke-width: 1;
  opacity: 0.7;
}

.chart-y-label {
  font-size: var(--ui-font-fine);
  fill: var(--text-muted);
  font-variant-numeric: tabular-nums;
  font-family: inherit;
}

.chart-x-label {
  font-size: var(--ui-font-fine);
  fill: var(--text-muted);
  font-variant-numeric: tabular-nums;
  font-family: inherit;
  opacity: 0.6;
}

.chart-x-label.is-today {
  fill: var(--accent);
  font-weight: 600;
  opacity: 1;
}

.chart-today-marker {
  fill: var(--accent);
  opacity: 0.5;
}

.chart-bar-shoulders {
  fill: var(--accent);
  opacity: 0.65;
  transition: opacity 0.1s;
}

.chart-bar-direct {
  fill: var(--fg-secondary);
  opacity: 0.3;
  transition: opacity 0.1s;
}

.chart-bar-group:hover .chart-bar-shoulders {
  opacity: 0.9;
}

.chart-bar-group:hover .chart-bar-direct {
  opacity: 0.5;
}

/* Tooltip */
.chart-tooltip {
  position: absolute;
  pointer-events: none;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 7px 10px;
  font-size: var(--ui-font-caption);
  color: var(--fg-secondary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  z-index: 10;
  white-space: nowrap;
  line-height: 1.5;
}

.chart-tooltip-date {
  font-weight: 500;
  color: var(--fg-primary);
  margin-bottom: 2px;
}

.chart-tooltip-row {
  display: flex;
  align-items: center;
  gap: 5px;
}

.chart-tooltip-swatch {
  width: 8px;
  height: 3px;
  border-radius: 1px;
  flex-shrink: 0;
}

.chart-tooltip .swatch-shoulders {
  background: var(--accent);
  opacity: 0.7;
}

.chart-tooltip .swatch-direct {
  background: var(--fg-secondary);
  opacity: 0.4;
}

.chart-tooltip-total {
  font-weight: 500;
  color: var(--fg-primary);
  margin-top: 2px;
  padding-top: 2px;
  border-top: 1px solid var(--border);
}

.chart-tooltip-calls {
  font-size: var(--ui-font-micro);
  color: var(--fg-muted);
}

/* Legend */
.chart-legend {
  display: flex;
  gap: 14px;
  margin-top: 6px;
  font-size: var(--ui-font-micro);
  color: var(--fg-muted);
}

.chart-legend-item {
  display: flex;
  align-items: center;
  gap: 5px;
}

.chart-legend-swatch {
  width: 10px;
  height: 4px;
  border-radius: 1px;
}

.swatch-shoulders {
  background: var(--accent);
  opacity: 0.7;
}

.swatch-direct {
  background: var(--fg-secondary);
  opacity: 0.3;
}

/* Source sections */
.usage-source-section {
  margin-top: 20px;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px;
  background: var(--bg-primary);
}

.usage-source-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 8px;
}

.usage-source-title {
  font-size: var(--ui-font-body);
  font-weight: 600;
  color: var(--fg-primary);
}

.usage-source-balance {
  font-size: var(--ui-font-caption);
  color: var(--fg-muted);
  font-variant-numeric: tabular-nums;
}

.usage-source-disclaimer {
  font-size: var(--ui-font-micro);
  color: var(--fg-muted);
  margin-bottom: 8px;
  line-height: 1.4;
  opacity: 0.8;
}

/* Summary line */
.usage-summary-line {
  font-size: var(--ui-font-label);
  color: var(--fg-secondary);
  font-variant-numeric: tabular-nums;
  margin-bottom: 10px;
}

.usage-sep {
  color: var(--fg-muted);
  opacity: 0.5;
}

.usage-empty-hint {
  font-size: var(--ui-font-caption);
  color: var(--fg-muted);
  font-style: italic;
  margin-bottom: 4px;
}

/* Breakdown toggle tabs */
.usage-breakdown-tabs {
  margin-bottom: 8px;
}

.usage-breakdown-tab {
  min-height: 24px;
}

/* Tables */
.usage-table {
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}

.usage-table-header,
.usage-table-row {
  display: grid;
  padding: 5px 10px;
  font-size: var(--ui-font-micro);
  color: var(--fg-muted);
}

.usage-table-header {
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  background: var(--bg-tertiary, var(--bg-secondary));
  border-bottom: 1px solid var(--border);
}

.usage-table-row {
  font-size: var(--ui-font-label);
  color: var(--fg-secondary);
  border-bottom: 1px solid var(--border);
}

.usage-table-row:last-child {
  border-bottom: none;
}

.usage-col-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.usage-col-num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-family: var(--font-mono);
  font-size: var(--ui-font-caption);
}

.usage-feature-name {
  text-transform: capitalize;
}

.usage-model-name {
  font-family: var(--font-mono);
  font-size: var(--ui-font-caption);
}

/* All-time stat */
.usage-alltime {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
  font-size: var(--ui-font-micro);
  color: var(--fg-muted);
  font-variant-numeric: tabular-nums;
}

/* Empty state */
.usage-empty-state {
  margin-top: 20px;
  padding: 20px;
  text-align: center;
  font-size: var(--ui-font-label);
  color: var(--fg-muted);
  line-height: 1.5;
  border: 1px dashed var(--border);
  border-radius: 8px;
}

/* Display toggles */
.display-toggles {
  display: flex;
  flex-direction: column;
}

.settings-usage-subtitle {
  margin-top: 24px;
}

.settings-usage-inline-hint {
  margin: 2px 0 0;
  font-size: var(--ui-font-caption);
  color: var(--text-muted);
  line-height: var(--line-height-regular);
}

.settings-usage-display-card {
  margin-top: var(--space-2);
}
</style>
