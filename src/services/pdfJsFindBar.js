import { FindState } from 'pdfjs-dist/legacy/web/pdf_viewer.mjs'

const MATCHES_COUNT_LIMIT = 1000

function toggleExpandedButton(button, expanded, view = null) {
  button?.classList?.toggle('toggled', expanded)
  if (button) {
    button.setAttribute('aria-expanded', String(expanded))
  }
  view?.classList?.toggle?.('hidden', !expanded)
}

function normalizeMatchesCount(matchesCount = {}) {
  const current = Number.parseInt(matchesCount.current ?? 0, 10)
  const total = Number.parseInt(matchesCount.total ?? 0, 10)
  return {
    current: Number.isFinite(current) && current > 0 ? current : 0,
    total: Number.isFinite(total) && total > 0 ? total : 0,
  }
}

function mapState(state) {
  switch (state) {
    case FindState.PENDING:
      return 'pending'
    case FindState.NOT_FOUND:
      return 'not_found'
    case FindState.WRAPPED:
      return 'wrapped'
    case FindState.FOUND:
      return 'found'
    default:
      return 'idle'
  }
}

export class PdfJsFindBar {
  #mainContainer
  #resizeObserver
  #onStateChange
  #t
  #abortController

  constructor(options, mainContainer, eventBus, t, onStateChange = () => {}) {
    this.opened = false
    this.bar = options.bar
    this.toggleButton = options.toggleButton
    this.findField = options.findField
    this.highlightAll = options.highlightAllCheckbox
    this.caseSensitive = options.caseSensitiveCheckbox
    this.matchDiacritics = options.matchDiacriticsCheckbox
    this.entireWord = options.entireWordCheckbox
    this.findMsg = options.findMsg
    this.findResultsCount = options.findResultsCount
    this.findPreviousButton = options.findPreviousButton
    this.findNextButton = options.findNextButton
    this.eventBus = eventBus
    this.#mainContainer = mainContainer
    this.#onStateChange = onStateChange
    this.#t = t
    this.#abortController = new AbortController()

    this.#resizeObserver = new ResizeObserver(() => {
      const bar = this.bar
      if (!bar?.firstElementChild) return
      bar.classList.remove('wrapContainers')
      if (bar.clientHeight > bar.firstElementChild.clientHeight) {
        bar.classList.add('wrapContainers')
      }
    })

    const checkedInputs = new Map([
      [this.highlightAll, 'highlightallchange'],
      [this.caseSensitive, 'casesensitivitychange'],
      [this.entireWord, 'entirewordchange'],
      [this.matchDiacritics, 'diacriticmatchingchange'],
    ])

    this.findField?.addEventListener('input', () => {
      this.dispatchEvent('')
    }, { signal: this.#abortController.signal })

    this.bar?.addEventListener('keydown', ({ key, shiftKey, target }) => {
      if (key === 'Enter') {
        if (target === this.findField) {
          this.dispatchEvent('again', shiftKey)
        } else if (checkedInputs.has(target)) {
          target.checked = !target.checked
          this.dispatchEvent(checkedInputs.get(target))
        }
      } else if (key === 'Escape') {
        this.close()
      }
    }, { signal: this.#abortController.signal })

    this.findPreviousButton?.addEventListener('click', () => {
      this.dispatchEvent('again', true)
    }, { signal: this.#abortController.signal })

    this.findNextButton?.addEventListener('click', () => {
      this.dispatchEvent('again', false)
    }, { signal: this.#abortController.signal })

    for (const [element, eventName] of checkedInputs) {
      element?.addEventListener('click', () => {
        this.dispatchEvent(eventName)
      }, { signal: this.#abortController.signal })
    }

    toggleExpandedButton(this.toggleButton, false, this.bar)
    this.#syncState({
      open: false,
      query: this.findField?.value || '',
      highlightAll: !!this.highlightAll?.checked,
      matchCase: !!this.caseSensitive?.checked,
      entireWord: !!this.entireWord?.checked,
      matchDiacritics: !!this.matchDiacritics?.checked,
      pending: false,
      status: 'idle',
      matchesCount: { current: 0, total: 0 },
      wrappedPrevious: false,
    })
  }

  get isOpen() {
    if (!this.bar) {
      return !!this.opened
    }
    return this.opened || !this.bar.classList.contains('hidden')
  }

  destroy() {
    this.#resizeObserver.disconnect()
    this.#abortController.abort()
  }

  setQuery(value) {
    if (this.findField) {
      this.findField.value = String(value || '')
    }
    this.#syncState({
      query: this.findField?.value || '',
    })
  }

  reset() {
    this.updateUIState()
  }

  dispatchEvent(type = '', findPrevious = false) {
    const query = this.findField?.value || ''
    this.#syncState({
      query,
      open: this.isOpen,
      highlightAll: !!this.highlightAll?.checked,
      matchCase: !!this.caseSensitive?.checked,
      entireWord: !!this.entireWord?.checked,
      matchDiacritics: !!this.matchDiacritics?.checked,
      pending: Boolean(query.trim()),
      status: query.trim() ? 'pending' : 'idle',
      wrappedPrevious: false,
    })

    this.eventBus.dispatch('find', {
      source: this,
      type,
      query,
      caseSensitive: !!this.caseSensitive?.checked,
      entireWord: !!this.entireWord?.checked,
      highlightAll: !!this.highlightAll?.checked,
      findPrevious,
      matchDiacritics: !!this.matchDiacritics?.checked,
    })
  }

  updateUIState(state, previous = false, matchesCount = {}) {
    const normalized = normalizeMatchesCount(matchesCount)
    let message = ''
    let status = ''

    switch (state) {
      case FindState.PENDING:
        message = this.#t('Searching PDF...')
        status = 'pending'
        break
      case FindState.NOT_FOUND:
        message = this.#t('No matches found')
        status = 'notFound'
        break
      case FindState.WRAPPED:
        message = previous
          ? this.#t('Reached the beginning and continued from the end')
          : this.#t('Reached the end and continued from the beginning')
        break
      default:
        break
    }

    if (this.findField) {
      this.findField.dataset.status = status
      this.findField.setAttribute('aria-invalid', String(state === FindState.NOT_FOUND))
    }

    if (this.findMsg) {
      this.findMsg.dataset.status = status
      this.findMsg.textContent = message
    }

    this.updateResultsCount(normalized)
    this.#syncState({
      pending: state === FindState.PENDING,
      status: mapState(state),
      wrappedPrevious: state === FindState.WRAPPED ? !!previous : false,
    })
  }

  updateResultsCount(matchesCount = {}) {
    const normalized = normalizeMatchesCount(matchesCount)
    if (this.findResultsCount) {
      this.findResultsCount.textContent = normalized.total > MATCHES_COUNT_LIMIT
        ? this.#t('More than {limit} matches', { limit: MATCHES_COUNT_LIMIT })
        : normalized.total > 0
          ? this.#t('{current} of {total}', normalized)
          : ''
    }
    this.#syncState({ matchesCount: normalized })
  }

  open() {
    if (!this.isOpen) {
      this.#resizeObserver.observe(this.#mainContainer)
      this.#resizeObserver.observe(this.bar)
    }
    this.opened = true
    toggleExpandedButton(this.toggleButton, true, this.bar)
    this.#syncState({ open: true })
    this.findField?.select?.()
    this.findField?.focus?.()
  }

  close() {
    this.#resizeObserver.disconnect()
    const wasOpen = this.isOpen
    this.opened = false
    toggleExpandedButton(this.toggleButton, false, this.bar)
    if (wasOpen) {
      this.eventBus.dispatch('findbarclose', { source: this })
    }
    this.#syncState({
      open: false,
      pending: false,
      status: this.findField?.value?.trim?.() ? 'found' : 'idle',
      wrappedPrevious: false,
    })
  }

  toggle() {
    if (this.isOpen) {
      this.close()
    } else {
      this.open()
    }
  }

  #syncState(patch = {}) {
    this.#onStateChange(patch)
  }
}
