export function buildPythonInterpreterOptions({
  interpreters = [],
  interpreterPreference = 'auto',
  translate = (key) => key,
} = {}) {
  const options = [
    {
      value: 'auto',
      label: translate('Auto'),
      triggerLabel: translate('Auto'),
    },
  ]

  for (const runtime of Array.isArray(interpreters) ? interpreters : []) {
    const runtimePath = String(runtime?.path || '').trim()
    if (!runtimePath) continue

    const versionLabel = runtime?.version
      ? `Python ${runtime.version}`
      : translate('Python')

    options.push({
      value: runtimePath,
      label: versionLabel,
      triggerLabel: versionLabel,
    })
  }

  const normalizedPreference = String(interpreterPreference || '').trim() || 'auto'
  if (
    normalizedPreference !== 'auto' &&
    !options.some((option) => option.value === normalizedPreference)
  ) {
    options.push({
      value: normalizedPreference,
      label: `${translate('Unavailable interpreter')} · ${normalizedPreference}`,
      triggerLabel: translate('Unavailable interpreter'),
    })
  }

  return options
}

export function buildPythonDiagnosticsPresentation({
  hasInterpreter = false,
  interpreter = {},
  interpreterPreference = 'auto',
  detectedInterpreterCount = 0,
  translate = (key) => key,
} = {}) {
  const detectedCount = Number(detectedInterpreterCount || 0)

  if (hasInterpreter) {
    return {
      dotClass: 'is-good',
      text: interpreter?.version
        ? `Python ${interpreter.version}`
        : translate('Selected'),
    }
  }

  if (String(interpreterPreference || '').trim() !== 'auto' && detectedCount > 0) {
    return {
      dotClass: 'is-none',
      text: translate('Unavailable'),
    }
  }

  return {
    dotClass: 'is-none',
    text: detectedCount > 0 ? translate('Available') : translate('Not found'),
  }
}
