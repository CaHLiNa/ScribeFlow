export function dispatchLatexBackwardSync(windowTarget, detail = {}) {
  windowTarget?.dispatchEvent?.(new CustomEvent('latex-backward-sync', { detail }))
}
