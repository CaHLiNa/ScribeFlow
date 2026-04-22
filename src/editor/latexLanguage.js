import { RangeSetBuilder } from '@codemirror/state'
import { StreamLanguage } from '@codemirror/language'
import { Decoration, ViewPlugin } from '@codemirror/view'
import { INITIAL, Registry, parseRawGrammar } from 'vscode-textmate'
import {
  createOnigScanner,
  createOnigString,
  loadWASM,
} from 'vscode-oniguruma'
import onigWasmUrl from 'vscode-oniguruma/release/onig.wasm?url'
import latexWorkshopLatexGrammar from './textmate/latex-workshop/LaTeX.tmLanguage.json'
import latexWorkshopTexGrammar from './textmate/latex-workshop/TeX.tmLanguage.json'
import vscode2026DarkThemeRaw from './textmate/vscode-themes/2026-dark.json?raw'
import vscode2026LightThemeRaw from './textmate/vscode-themes/2026-light.json?raw'
import vscodeDarkModernThemeRaw from './textmate/vscode-themes/dark_modern.json?raw'
import vscodeDarkPlusThemeRaw from './textmate/vscode-themes/dark_plus.json?raw'
import vscodeDarkVsThemeRaw from './textmate/vscode-themes/dark_vs.json?raw'
import vscodeLightModernThemeRaw from './textmate/vscode-themes/light_modern.json?raw'
import vscodeLightPlusThemeRaw from './textmate/vscode-themes/light_plus.json?raw'
import vscodeLightVsThemeRaw from './textmate/vscode-themes/light_vs.json?raw'

const LATEX_SCOPE_NAME = 'text.tex.latex'
const TEX_SCOPE_NAME = 'text.tex'

const FONT_STYLE_ITALIC = 1
const FONT_STYLE_BOLD = 2
const FONT_STYLE_UNDERLINE = 4
const FONT_STYLE_STRIKETHROUGH = 8
const FONT_STYLE_MASK = 30720
const FONT_STYLE_OFFSET = 11
const FOREGROUND_MASK = 16744448
const FOREGROUND_OFFSET = 15
const BRACKET_COLOR_COUNT = 6
const LATEX_THEME_MODE_DARK = 'dark'
const LATEX_THEME_MODE_LIGHT = 'light'

const parsedLatexGrammar = parseRawGrammar(
  JSON.stringify(latexWorkshopLatexGrammar),
  'LaTeX.tmLanguage.json'
)
const parsedTexGrammar = parseRawGrammar(
  JSON.stringify(latexWorkshopTexGrammar),
  'TeX.tmLanguage.json'
)

function stripJsonComments(source) {
  let result = ''
  let index = 0
  let inString = false
  let stringQuote = ''

  while (index < source.length) {
    const current = source[index]
    const next = source[index + 1]

    if (inString) {
      result += current
      if (current === '\\') {
        result += next || ''
        index += 2
        continue
      }
      if (current === stringQuote) {
        inString = false
        stringQuote = ''
      }
      index += 1
      continue
    }

    if (current === '"' || current === "'") {
      inString = true
      stringQuote = current
      result += current
      index += 1
      continue
    }

    if (current === '/' && next === '/') {
      index += 2
      while (index < source.length && source[index] !== '\n') {
        index += 1
      }
      continue
    }

    if (current === '/' && next === '*') {
      index += 2
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
        index += 1
      }
      index += 2
      continue
    }

    result += current
    index += 1
  }

  return result
}

function stripTrailingCommas(source) {
  let result = ''
  let index = 0
  let inString = false
  let stringQuote = ''

  while (index < source.length) {
    const current = source[index]

    if (inString) {
      result += current
      if (current === '\\') {
        result += source[index + 1] || ''
        index += 2
        continue
      }
      if (current === stringQuote) {
        inString = false
        stringQuote = ''
      }
      index += 1
      continue
    }

    if (current === '"' || current === "'") {
      inString = true
      stringQuote = current
      result += current
      index += 1
      continue
    }

    if (current === ',') {
      let lookahead = index + 1
      while (lookahead < source.length && /\s/.test(source[lookahead])) {
        lookahead += 1
      }
      if (source[lookahead] === '}' || source[lookahead] === ']') {
        index += 1
        continue
      }
    }

    result += current
    index += 1
  }

  return result
}

function parseJsonc(source) {
  return JSON.parse(stripTrailingCommas(stripJsonComments(source)))
}

const rawThemeFiles = Object.freeze({
  './2026-dark.json': parseJsonc(vscode2026DarkThemeRaw),
  './2026-light.json': parseJsonc(vscode2026LightThemeRaw),
  './dark_modern.json': parseJsonc(vscodeDarkModernThemeRaw),
  './dark_plus.json': parseJsonc(vscodeDarkPlusThemeRaw),
  './dark_vs.json': parseJsonc(vscodeDarkVsThemeRaw),
  './light_modern.json': parseJsonc(vscodeLightModernThemeRaw),
  './light_plus.json': parseJsonc(vscodeLightPlusThemeRaw),
  './light_vs.json': parseJsonc(vscodeLightVsThemeRaw),
})

const decorationCache = new Map()
const mergedVsCode2026ThemeDefinitions = Object.freeze({
  [LATEX_THEME_MODE_DARK]: createRawTextmateTheme(rawThemeFiles['./2026-dark.json']),
  [LATEX_THEME_MODE_LIGHT]: createRawTextmateTheme(rawThemeFiles['./2026-light.json']),
})

const latexTextmateRuntime = {
  [LATEX_THEME_MODE_DARK]: null,
  [LATEX_THEME_MODE_LIGHT]: null,
}
let latexTextmateReadyPromise = null
let onigurumaReadyPromise = null

function resolveIncludedTheme(theme, seen = new Set()) {
  if (!theme?.include) {
    return {
      colors: { ...(theme?.colors || {}) },
      tokenColors: [...(theme?.tokenColors || [])],
    }
  }

  if (seen.has(theme.include)) {
    throw new Error(`Circular VS Code theme include detected: ${theme.include}`)
  }

  const parentTheme = rawThemeFiles[theme.include]
  if (!parentTheme) {
    throw new Error(`Unknown VS Code theme include: ${theme.include}`)
  }

  const mergedParent = resolveIncludedTheme(parentTheme, new Set([...seen, theme.include]))
  return {
    colors: {
      ...mergedParent.colors,
      ...(theme.colors || {}),
    },
    tokenColors: [
      ...mergedParent.tokenColors,
      ...(theme.tokenColors || []),
    ],
  }
}

function createRawTextmateTheme(theme) {
  const merged = resolveIncludedTheme(theme)
  const defaultForeground =
    merged.colors['editor.foreground'] ||
    merged.colors.foreground ||
    '#D4D4D4'
  const defaultBackground =
    merged.colors['editor.background'] ||
    merged.colors.background ||
    '#1E1E1E'

  return {
    name: theme.name,
    settings: [
      {
        settings: {
          foreground: defaultForeground,
          background: defaultBackground,
        },
      },
      ...merged.tokenColors,
    ],
  }
}

function getDecorationForStyle(style) {
  if (!decorationCache.has(style)) {
    decorationCache.set(
      style,
      Decoration.mark({
        attributes: { style },
      })
    )
  }
  return decorationCache.get(style)
}

function getFontStyle(metadata) {
  return (metadata & FONT_STYLE_MASK) >>> FONT_STYLE_OFFSET
}

function getForegroundId(metadata) {
  return (metadata & FOREGROUND_MASK) >>> FOREGROUND_OFFSET
}

function getResolvedLatexThemeMode(view) {
  const root =
    view?.dom?.ownerDocument?.documentElement ||
    (typeof document !== 'undefined' ? document.documentElement : null)
  const resolvedTheme = String(root?.dataset?.themeResolved || '').trim().toLowerCase()
  return resolvedTheme === LATEX_THEME_MODE_LIGHT ? LATEX_THEME_MODE_LIGHT : LATEX_THEME_MODE_DARK
}

function getLatexTextmateRuntime(themeMode = LATEX_THEME_MODE_DARK) {
  const runtime = latexTextmateRuntime[themeMode]
  if (!runtime?.grammar || !runtime?.colorMap) {
    throw new Error(`LaTeX TextMate runtime has not been initialized for theme: ${themeMode}`)
  }
  return runtime
}

function buildInlineTextStyle(metadata, colorMap) {
  const styleParts = []
  const foregroundId = getForegroundId(metadata)
  const foreground = colorMap?.[foregroundId]
  const fontStyle = getFontStyle(metadata)

  if (foreground) {
    styleParts.push(`color: ${foreground}`)
  }
  if (fontStyle & FONT_STYLE_ITALIC) {
    styleParts.push('font-style: italic')
  }
  if (fontStyle & FONT_STYLE_BOLD) {
    styleParts.push('font-weight: 700')
  }

  const textDecorations = []
  if (fontStyle & FONT_STYLE_UNDERLINE) {
    textDecorations.push('underline')
  }
  if (fontStyle & FONT_STYLE_STRIKETHROUGH) {
    textDecorations.push('line-through')
  }
  if (textDecorations.length > 0) {
    styleParts.push(`text-decoration-line: ${textDecorations.join(' ')}`)
  }

  return styleParts.join('; ')
}

function isEscaped(text, index) {
  let slashCount = 0
  let cursor = index - 1
  while (cursor >= 0 && text[cursor] === '\\') {
    slashCount += 1
    cursor -= 1
  }
  return slashCount % 2 === 1
}

function getBracketColorStyle(depth) {
  const bracketColorIndex = (depth % BRACKET_COLOR_COUNT) + 1
  return `color: var(--editor-bracket-highlight-${bracketColorIndex})`
}

function buildLatexBracketSpans(state) {
  const text = state.doc.toString()
  const stack = []
  const spans = []
  let index = 0

  while (index < text.length) {
    const current = text[index]
    const next = text[index + 1]

    if (current === '%' && !isEscaped(text, index)) {
      index += 1
      while (index < text.length && text[index] !== '\n') {
        index += 1
      }
      continue
    }

    if (current === '\\' && next) {
      const escapedBracketPairs = {
        '{': '}',
        '[': ']',
        '(': ')',
        '}': null,
        ']': null,
        ')': null,
      }

      if (Object.hasOwn(escapedBracketPairs, next)) {
        const from = index
        const to = index + 2

        if (next === '{' || next === '[' || next === '(') {
          const style = getBracketColorStyle(stack.length)
          stack.push({
            close: `\\${escapedBracketPairs[next]}`,
            style,
          })
          spans.push({ from, to, style })
          index += 2
          continue
        }

        const token = `\\${next}`
        const expected = stack[stack.length - 1]
        if (expected && expected.close === token) {
          spans.push({ from, to, style: expected.style })
          stack.pop()
          index += 2
          continue
        }
      }
    }

    const openingBrackets = {
      '{': '}',
      '[': ']',
      '(': ')',
    }
    const closingBrackets = new Set(['}', ']', ')'])

    if (Object.hasOwn(openingBrackets, current)) {
      const style = getBracketColorStyle(stack.length)
      stack.push({
        close: openingBrackets[current],
        style,
      })
      spans.push({ from: index, to: index + 1, style })
      index += 1
      continue
    }

    if (closingBrackets.has(current)) {
      const expected = stack[stack.length - 1]
      if (expected && expected.close === current) {
        spans.push({ from: index, to: index + 1, style: expected.style })
        stack.pop()
      }
      index += 1
      continue
    }

    index += 1
  }

  return spans.sort((left, right) => left.from - right.from)
}

function addStyledRange(builder, from, to, style) {
  if (to <= from || !style) return
  builder.add(from, to, getDecorationForStyle(style))
}

async function ensureOnigurumaReady() {
  if (!onigurumaReadyPromise) {
    onigurumaReadyPromise = (async () => {
      const response = await fetch(onigWasmUrl)
      await loadWASM(response)
      return {
        createOnigScanner(patterns) {
          return createOnigScanner(patterns)
        },
        createOnigString(content) {
          return createOnigString(content)
        },
      }
    })()
  }
  return onigurumaReadyPromise
}

function loadRawGrammar(scopeName) {
  if (scopeName === LATEX_SCOPE_NAME) return parsedLatexGrammar
  if (scopeName === TEX_SCOPE_NAME) return parsedTexGrammar
  return null
}

export async function ensureLatexTextmateReady() {
  if (!latexTextmateReadyPromise) {
    latexTextmateReadyPromise = (async () => {
      const onigLib = ensureOnigurumaReady()
      const createRuntimeForTheme = async (themeMode, themeDefinition) => {
        const registry = new Registry({
          theme: themeDefinition,
          onigLib,
          loadGrammar: async (scopeName) => loadRawGrammar(scopeName),
        })
        const grammar = await registry.loadGrammar(LATEX_SCOPE_NAME)
        const colorMap = registry.getColorMap()
        if (!grammar || !colorMap) {
          throw new Error(`Failed to initialize LaTeX TextMate runtime for theme: ${themeMode}`)
        }
        latexTextmateRuntime[themeMode] = { grammar, colorMap }
      }

      await Promise.all([
        createRuntimeForTheme(
          LATEX_THEME_MODE_DARK,
          mergedVsCode2026ThemeDefinitions[LATEX_THEME_MODE_DARK]
        ),
        createRuntimeForTheme(
          LATEX_THEME_MODE_LIGHT,
          mergedVsCode2026ThemeDefinitions[LATEX_THEME_MODE_LIGHT]
        ),
      ])
    })()
  }

  return latexTextmateReadyPromise
}

function buildLatexTextmateDecorations(state, themeMode = LATEX_THEME_MODE_DARK) {
  const { grammar, colorMap } = getLatexTextmateRuntime(themeMode)
  const builder = new RangeSetBuilder()
  const bracketSpans = buildLatexBracketSpans(state)
  let bracketIndex = 0
  let ruleStack = INITIAL

  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber)
    const lineResult = grammar.tokenizeLine2(line.text, ruleStack)
    const binaryTokens = lineResult.tokens
    ruleStack = lineResult.ruleStack

    for (let index = 0; index < binaryTokens.length; index += 2) {
      const startIndex = binaryTokens[index]
      const metadata = binaryTokens[index + 1]
      const endIndex =
        index + 2 < binaryTokens.length ? binaryTokens[index + 2] : line.text.length

      if (endIndex <= startIndex) continue

      const style = buildInlineTextStyle(metadata, colorMap)
      if (!style) continue

      const tokenFrom = line.from + startIndex
      const tokenTo = line.from + endIndex
      let cursor = tokenFrom

      while (bracketIndex < bracketSpans.length && bracketSpans[bracketIndex].to <= tokenFrom) {
        bracketIndex += 1
      }

      let scanIndex = bracketIndex
      while (scanIndex < bracketSpans.length && bracketSpans[scanIndex].from < tokenTo) {
        const span = bracketSpans[scanIndex]
        if (span.from > cursor) {
          addStyledRange(builder, cursor, span.from, style)
        }
        addStyledRange(builder, Math.max(span.from, tokenFrom), Math.min(span.to, tokenTo), span.style)
        cursor = Math.max(cursor, span.to)
        scanIndex += 1
      }

      if (cursor < tokenTo) {
        addStyledRange(builder, cursor, tokenTo, style)
      }
    }
  }

  return builder.finish()
}

export function createLatexTextmateHighlightExtension() {
  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.view = view
        this.themeMode = getResolvedLatexThemeMode(view)
        this.decorations = buildLatexTextmateDecorations(view.state, this.themeMode)
        this.handleWorkspaceThemeUpdated = () => {
          const nextThemeMode = getResolvedLatexThemeMode(this.view)
          if (nextThemeMode === this.themeMode) return
          this.themeMode = nextThemeMode
          this.decorations = buildLatexTextmateDecorations(this.view.state, this.themeMode)
          this.view.dispatch({})
        }

        if (typeof window !== 'undefined') {
          window.addEventListener('workspace-theme-updated', this.handleWorkspaceThemeUpdated)
        }
      }

      update(update) {
        const nextThemeMode = getResolvedLatexThemeMode(update.view)
        if (update.docChanged || nextThemeMode !== this.themeMode) {
          this.themeMode = nextThemeMode
          this.decorations = buildLatexTextmateDecorations(update.state, this.themeMode)
        }
      }

      destroy() {
        if (typeof window !== 'undefined') {
          window.removeEventListener('workspace-theme-updated', this.handleWorkspaceThemeUpdated)
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
    }
  )
}

export const altalsLatexLanguage = StreamLanguage.define({
  name: 'latex-textmate-host',
  startState() {
    return null
  },
  copyState() {
    return null
  },
  token(stream) {
    stream.skipToEnd()
    return null
  },
  languageData: {
    commentTokens: { line: '%' },
  },
})

export const latexTextmateHostLanguage = altalsLatexLanguage
