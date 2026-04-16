function trimSlash(value = '') {
  return String(value || '').trim().replace(/\/+$/, '')
}

export function normalizeBaseUrl(baseUrl = '') {
  return trimSlash(baseUrl)
}

export function normalizeOpenAiBaseUrl(baseUrl = '') {
  return trimSlash(baseUrl).replace(/\/chat\/completions$/i, '')
}

export function normalizeAnthropicBaseUrl(baseUrl = '') {
  let url = trimSlash(baseUrl)
  url = url.replace(/\/messages$/i, '')
  if (!/\/v\d+$/i.test(url)) {
    url = `${url}/v1`
  }
  return url
}

export function normalizeGoogleBaseUrl(baseUrl = '') {
  return trimSlash(baseUrl)
    .replace(/\/v1beta\/openai$/i, '')
    .replace(/\/v1beta$/i, '')
}
