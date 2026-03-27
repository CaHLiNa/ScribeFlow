/**
 * All supported LaTeX citation commands (natbib + biblatex + capitalized variants).
 * Shared between editor decorations and non-editor bibliography helpers.
 */
export const CITE_CMDS = 'cite[tp]?|citealp|citealt|citeauthor|citeyear|autocite|textcite|parencite|nocite|footcite|fullcite|supercite|smartcite|Cite[tp]?|Parencite|Textcite|Autocite|Smartcite|Footcite|Fullcite'

/**
 * Matches LaTeX citation commands: \cite{key}, \citep{key1, key2}, \citet{key}, etc.
 * Captures the command name and the keys inside braces.
 */
export const LATEX_CITE_RE = new RegExp(`\\\\(${CITE_CMDS})\\{([^}]*)\\}`, 'g')

/**
 * Matches individual citation keys inside braces (comma-separated).
 */
export const LATEX_CITE_KEY_RE = /([a-zA-Z][\w.-]*)/g

export function extractLatexCitationKeys(text = '') {
  const keys = []
  const seen = new Set()
  const source = String(text || '')

  LATEX_CITE_RE.lastIndex = 0
  let match
  while ((match = LATEX_CITE_RE.exec(source)) !== null) {
    LATEX_CITE_KEY_RE.lastIndex = 0
    let keyMatch
    while ((keyMatch = LATEX_CITE_KEY_RE.exec(match[2] || '')) !== null) {
      const key = keyMatch[1]
      if (!seen.has(key)) {
        seen.add(key)
        keys.push(key)
      }
    }
  }

  return keys
}
