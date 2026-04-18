<template>
  <AiRuntimeStateCard
    :visible="visible"
    :tone="tone"
    :title="title"
    :body="body"
    :items="serverItems"
    :max-visible-items="2"
    :max-detail-length="44"
  />
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '../../i18n'
import AiRuntimeStateCard from './AiRuntimeStateCard.vue'

const props = defineProps({
  state: {
    type: Object,
    default: () => ({
      discoveredCount: 0,
      readyCount: 0,
      degradedCount: 0,
      unsupportedCount: 0,
      toolCount: 0,
      servers: [],
    }),
  },
})

const { t } = useI18n()
const normalizedState = computed(() => props.state || {})
const issueCount = computed(
  () =>
    Number(normalizedState.value.degradedCount || 0)
    + Number(normalizedState.value.unsupportedCount || 0)
)
const visible = computed(
  () => Number(normalizedState.value.readyCount || 0) > 0 || issueCount.value > 0
)
const tone = computed(() => (issueCount.value > 0 ? 'warning' : 'info'))
const title = computed(() =>
  issueCount.value > 0 ? t('MCP extensions need attention') : t('MCP extensions are ready')
)
const body = computed(() => {
  const readyCount = Number(normalizedState.value.readyCount || 0)
  const toolCount = Number(normalizedState.value.toolCount || 0)
  if (issueCount.value > 0 && readyCount > 0) {
    return t('{ready} ready · {attention} need attention', {
      ready: readyCount,
      attention: issueCount.value,
    })
  }
  if (issueCount.value > 0) {
    return t('{count} MCP servers need attention before the runtime can rely on them.', {
      count: issueCount.value,
    })
  }
  return t('{count} MCP servers expose {tools} tools to this runtime.', {
    count: readyCount,
    tools: toolCount,
  })
})

const serverItems = computed(() =>
  (Array.isArray(normalizedState.value.servers) ? normalizedState.value.servers : [])
    .filter((server) => {
      const state = String(server?.state || '').trim()
      return state === 'ready' || state === 'degraded' || state === 'unsupported'
    })
    .map((server) => ({
      key: server.id,
      label: server.name,
      detail: buildServerDetail(server),
    }))
)

function buildServerDetail(server = {}) {
  const state = String(server.state || '').trim()
  const toolCount = Number(server.toolCount || 0)
  const transport = String(server.transport || '').trim()
  const protocolVersion = String(server.protocolVersion || '').trim()
  const error = String(server.error || '').trim()

  if (state === 'ready') {
    const protocolText = protocolVersion ? ` · ${protocolVersion}` : ''
    return t('{count} tools ready{protocol}', {
      count: toolCount,
      protocol: protocolText,
    })
  }
  if (state === 'unsupported') {
    return t('{transport} transport is not supported in this Phase 4 slice.', {
      transport: transport || 'Unknown',
    })
  }
  return error || t('Runtime probe failed.')
}
</script>
