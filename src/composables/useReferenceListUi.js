import { computed, nextTick, onUnmounted, ref } from 'vue'

function getAnchorPosition(anchor) {
  const rect = anchor.getBoundingClientRect()
  return {
    position: 'fixed',
    left: `${rect.left}px`,
    top: `${rect.bottom + 2}px`,
  }
}

export function useReferenceListUi(options) {
  const {
    referencesStore,
    searchQueryRef,
    searchedRefs,
    citedCount,
    notCitedCount,
    t,
    getAvailableStyles,
    getStyleName,
  } = options

  const searchQuery = searchQueryRef || ref('')
  const searchFocused = ref(false)
  const showAddDialog = ref(false)

  const showSortMenu = ref(false)
  const sortBtnEl = ref(null)
  const sortMenuPos = ref({ position: 'fixed', left: '0px', top: '0px' })

  const showStyleMenu = ref(false)
  const styleBtnEl = ref(null)
  const styleSearchEl = ref(null)
  const styleSearchQuery = ref('')
  const styleMenuPos = ref({ position: 'fixed', left: '0px', top: '0px' })

  const citedFilter = ref('all')
  const showFilterMenu = ref(false)
  const filterBtnEl = ref(null)
  const filterMenuPos = ref({ position: 'fixed', left: '0px', top: '0px' })

  const showExportMenu = ref(false)
  const exportBtnEl = ref(null)
  const exportMenuPos = ref({ position: 'fixed', left: '0px', top: '0px' })

  const importToast = ref(null)
  let toastTimer = null

  const activeStyleName = computed(() => getStyleName(referencesStore.citationStyle))

  const filteredStyles = computed(() => {
    const all = getAvailableStyles()
    if (!styleSearchQuery.value.trim()) return all
    const query = styleSearchQuery.value.toLowerCase()
    return all.filter((style) =>
      style.name.toLowerCase().includes(query) || (style.category || '').toLowerCase().includes(query)
    )
  })

  const filterOptions = computed(() => [
    { value: 'all', label: t('All ({count})', { count: searchedRefs.value.length }) },
    { value: 'cited', label: t('Cited ({count})', { count: citedCount.value }) },
    { value: 'notCited', label: t('Not cited ({count})', { count: notCitedCount.value }) },
  ])

  const filterLabel = computed(() => {
    if (citedFilter.value === 'cited') return t('Cited {count}', { count: citedCount.value })
    if (citedFilter.value === 'notCited') return t('Not cited {count}', { count: notCitedCount.value })
    return t('All {count}', { count: searchedRefs.value.length })
  })

  const sortOptions = computed(() => [
    { value: 'addedAt-desc', label: t('Date added (newest)'), field: 'addedAt', dir: 'desc' },
    { value: 'addedAt-asc', label: t('Date added (oldest)'), field: 'addedAt', dir: 'asc' },
    { value: 'author-asc', label: t('Author A → Z'), field: 'author', dir: 'asc' },
    { value: 'author-desc', label: t('Author Z → A'), field: 'author', dir: 'desc' },
    { value: 'year-desc', label: t('Year (newest)'), field: 'year', dir: 'desc' },
    { value: 'year-asc', label: t('Year (oldest)'), field: 'year', dir: 'asc' },
    { value: 'title-asc', label: t('Title A → Z'), field: 'title', dir: 'asc' },
    { value: 'title-desc', label: t('Title Z → A'), field: 'title', dir: 'desc' },
  ])

  const currentSortKey = computed(() => `${referencesStore.sortBy}-${referencesStore.sortDir}`)

  function applySortOption(value) {
    const option = sortOptions.value.find((item) => item.value === value)
    if (!option) return
    referencesStore.sortBy = option.field
    referencesStore.sortDir = option.dir
  }

  function toggleFilterMenu() {
    showFilterMenu.value = !showFilterMenu.value
    if (showFilterMenu.value && filterBtnEl.value) {
      filterMenuPos.value = getAnchorPosition(filterBtnEl.value)
    }
  }

  function toggleStyleMenu() {
    showStyleMenu.value = !showStyleMenu.value
    styleSearchQuery.value = ''
    if (showStyleMenu.value && styleBtnEl.value) {
      styleMenuPos.value = getAnchorPosition(styleBtnEl.value)
      nextTick(() => styleSearchEl.value?.focus())
    }
  }

  function selectStyle(id) {
    referencesStore.setCitationStyle(id)
    showStyleMenu.value = false
  }

  function toggleSortMenu() {
    showSortMenu.value = !showSortMenu.value
    if (showSortMenu.value && sortBtnEl.value) {
      sortMenuPos.value = getAnchorPosition(sortBtnEl.value)
    }
  }

  function toggleExportMenu() {
    showExportMenu.value = !showExportMenu.value
    if (showExportMenu.value && exportBtnEl.value) {
      exportMenuPos.value = getAnchorPosition(exportBtnEl.value)
    }
  }

  function clearToast() {
    importToast.value = null
    if (toastTimer) {
      clearTimeout(toastTimer)
      toastTimer = null
    }
  }

  function showImportMessage(text, hasAdded = false) {
    clearToast()
    importToast.value = { text, hasAdded }
    toastTimer = setTimeout(() => {
      importToast.value = null
      toastTimer = null
    }, 4000)
  }

  function showImportSummary(added, duplicates, failed = 0) {
    const parts = []
    if (added > 0) {
      parts.push(t('{count} added', { count: added }))
    }
    if (duplicates > 0) {
      parts.push(t(duplicates === 1 ? '{count} duplicate skipped' : '{count} duplicates skipped', { count: duplicates }))
    }
    if (failed > 0) {
      parts.push(t(failed === 1 ? '{count} import failed' : '{count} imports failed', { count: failed }))
    }
    if (!parts.length) return
    showImportMessage(parts.join(', '), added > 0)
  }

  onUnmounted(() => {
    clearToast()
  })

  return {
    searchQuery,
    searchFocused,
    showAddDialog,
    showSortMenu,
    sortBtnEl,
    sortMenuPos,
    showStyleMenu,
    styleBtnEl,
    styleSearchEl,
    styleSearchQuery,
    styleMenuPos,
    citedFilter,
    showFilterMenu,
    filterBtnEl,
    filterMenuPos,
    showExportMenu,
    exportBtnEl,
    exportMenuPos,
    importToast,
    activeStyleName,
    filteredStyles,
    filterOptions,
    filterLabel,
    sortOptions,
    currentSortKey,
    applySortOption,
    toggleFilterMenu,
    toggleStyleMenu,
    selectStyle,
    toggleSortMenu,
    toggleExportMenu,
    showImportMessage,
    showImportSummary,
    clearToast,
  }
}
