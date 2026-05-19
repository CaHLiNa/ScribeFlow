function normalizePart(value = '') {
  return String(value || '').trim().toLowerCase()
}

function normalizeEventKey(value = '') {
  const key = normalizePart(value)
  if (key === ' ') return 'space'
  if (key === 'escape') return 'esc'
  if (key.startsWith('arrow')) return key
  return key
}

function normalizeKeybindingKey(value = '') {
  const key = normalizePart(value)
  if (key === ' ') return 'space'
  if (key === 'escape') return 'esc'
  if (key === 'return') return 'enter'
  if (key === 'left') return 'arrowleft'
  if (key === 'right') return 'arrowright'
  if (key === 'up') return 'arrowup'
  if (key === 'down') return 'arrowdown'
  return key
}

function parseKeybinding(value = '', platform = {}) {
  const parts = String(value || '')
    .split('+')
    .map((part) => normalizePart(part))
    .filter(Boolean)
  const result = {
    ctrl: false,
    meta: false,
    alt: false,
    shift: false,
    key: '',
  }

  for (const part of parts) {
    if (part === 'mod') {
      if (platform.isMac) {
        result.meta = true
      } else {
        result.ctrl = true
      }
    } else if (part === 'cmd' || part === 'command' || part === 'meta') {
      result.meta = true
    } else if (part === 'ctrl' || part === 'control') {
      result.ctrl = true
    } else if (part === 'alt' || part === 'option') {
      result.alt = true
    } else if (part === 'shift') {
      result.shift = true
    } else {
      result.key = normalizeKeybindingKey(part)
    }
  }

  return result
}

export function keybindingForPlatform(binding = {}, platform = {}) {
  if (platform.isMac && binding.mac) return binding.mac
  if (platform.isWindows && binding.win) return binding.win
  if (platform.isLinux && binding.linux) return binding.linux
  return binding.key || binding.mac || binding.win || binding.linux || ''
}

export function eventMatchesKeybinding(event, binding = {}, platform = {}) {
  const raw = keybindingForPlatform(binding, platform)
  const parsed = parseKeybinding(raw, platform)
  if (!parsed.key) return false
  return Boolean(event.ctrlKey) === parsed.ctrl &&
    Boolean(event.metaKey) === parsed.meta &&
    Boolean(event.altKey) === parsed.alt &&
    Boolean(event.shiftKey) === parsed.shift &&
    normalizeEventKey(event.key) === parsed.key
}

export function isEditableKeybindingTarget(target) {
  const element = target?.nodeType === 1 ? target : target?.parentElement || null
  if (!element) return false
  if (element.isContentEditable) return true
  return Boolean(element.closest?.('input, textarea, select, [contenteditable="true"]'))
}
