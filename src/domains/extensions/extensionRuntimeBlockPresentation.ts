import { buildExtensionRuntimeBlockDescriptor } from './extensionCommandHostState.ts'

function cloneMessageParams(params = {}) {
  return params && typeof params === 'object' && !Array.isArray(params)
    ? { ...params }
    : {}
}

export function buildExtensionRuntimeBlockPresentation(runtimeBlock = {}) {
  const blocked = runtimeBlock?.blocked === true
  return {
    blocked,
    status: String(runtimeBlock?.status || '').trim(),
    toneClass: String(runtimeBlock?.tone || '').trim(),
    labelKey: blocked ? String(runtimeBlock?.labelKey || '').trim() : '',
    messageKey: blocked ? String(runtimeBlock?.messageKey || '').trim() : '',
    messageParams: blocked ? cloneMessageParams(runtimeBlock?.messageParams) : {},
  }
}

export function describeExtensionRuntimeBlockPresentation(runtimeBlock = {}, translate = (key) => key) {
  const presentation = buildExtensionRuntimeBlockPresentation(runtimeBlock)
  return {
    ...presentation,
    label: presentation.labelKey ? translate(presentation.labelKey) : '',
    message: presentation.messageKey
      ? translate(presentation.messageKey, presentation.messageParams)
      : '',
  }
}

export function describeExtensionHostStatePresentation(hostState = {}, translate = (key) => key) {
  return describeExtensionRuntimeBlockPresentation(
    buildExtensionRuntimeBlockDescriptor(hostState),
    translate,
  )
}
