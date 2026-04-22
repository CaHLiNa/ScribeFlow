import { RangeSetBuilder } from '@codemirror/state'
import { StreamLanguage } from '@codemirror/language'
import { Decoration, EditorView, ViewPlugin } from '@codemirror/view'
import { INITIAL, Registry, parseRawGrammar } from 'vscode-textmate'
import {
  createOnigScanner,
  createOnigString,
  loadWASM,
} from 'vscode-oniguruma'
import onigWasmUrl from 'vscode-oniguruma/release/onig.wasm?url'
import latexWorkshopLatexGrammar from './textmate/latex-workshop/LaTeX.tmLanguage.json'
import latexWorkshopTexGrammar from './textmate/latex-workshop/TeX.tmLanguage.json'

const LATEX_SCOPE_NAME = 'text.tex.latex'
const TEX_SCOPE_NAME = 'text.tex'

const parsedLatexGrammar = parseRawGrammar(
  JSON.stringify(latexWorkshopLatexGrammar),
  'LaTeX.tmLanguage.json'
)
const parsedTexGrammar = parseRawGrammar(
  JSON.stringify(latexWorkshopTexGrammar),
  'TeX.tmLanguage.json'
)

const decorationCache = new Map()

let latexTextmateGrammar = null
let latexTextmateReadyPromise = null
let onigurumaReadyPromise = null

const TEXTMATE_SCOPE_CLASSIFIERS = Object.freeze([
  ['comment.line', 'cm-tm-comment'],
  ['comment.block', 'cm-tm-comment'],
  ['comment.', 'cm-tm-comment'],
  ['markup.underline.link', 'cm-tm-link'],
  ['markup.bold', 'cm-tm-strong'],
  ['markup.italic', 'cm-tm-emphasis'],
  ['markup.raw', 'cm-tm-raw'],
  ['meta.embedded.block', 'cm-tm-raw'],
  ['meta.function.embedded', 'cm-tm-raw'],
  ['entity.name.section', 'cm-tm-section'],
  ['constant.other.reference.citation', 'cm-tm-citation'],
  ['constant.other.reference.label', 'cm-tm-label'],
  ['variable.parameter.definition.label', 'cm-tm-label'],
  ['variable.parameter.function', 'cm-tm-environment'],
  ['support.function.url', 'cm-tm-link-function'],
  ['support.function.section', 'cm-tm-section-function'],
  ['support.function', 'cm-tm-support-function'],
  ['support.class.math.block.environment', 'cm-tm-math-environment'],
  ['support.class', 'cm-tm-class'],
  ['meta.math', 'cm-tm-math'],
  ['meta.preamble', 'cm-tm-preamble'],
  ['meta.include', 'cm-tm-include'],
  ['keyword.control', 'cm-tm-keyword-control'],
  ['keyword.operator', 'cm-tm-operator'],
  ['punctuation.definition', 'cm-tm-punctuation'],
  ['punctuation.section', 'cm-tm-punctuation'],
  ['punctuation.group', 'cm-tm-punctuation'],
])

function getDecorationForClasses(className) {
  if (!decorationCache.has(className)) {
    decorationCache.set(className, Decoration.mark({ class: className }))
  }
  return decorationCache.get(className)
}

function classifyTextmateScopes(scopes = []) {
  const classes = new Set()

  for (const scope of scopes) {
    for (const [prefix, className] of TEXTMATE_SCOPE_CLASSIFIERS) {
      if (scope.startsWith(prefix)) {
        classes.add(className)
      }
    }
  }

  return Array.from(classes).join(' ')
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
      const registry = new Registry({
        onigLib: ensureOnigurumaReady(),
        loadGrammar: async (scopeName) => loadRawGrammar(scopeName),
      })

      latexTextmateGrammar = await registry.loadGrammar(LATEX_SCOPE_NAME)
      if (!latexTextmateGrammar) {
        throw new Error('Failed to load LaTeX-Workshop TextMate grammar.')
      }

      return latexTextmateGrammar
    })()
  }

  return latexTextmateReadyPromise
}

function requireLatexTextmateGrammar() {
  if (!latexTextmateGrammar) {
    throw new Error('LaTeX-Workshop TextMate grammar has not been initialized yet.')
  }
  return latexTextmateGrammar
}

function buildLatexTextmateDecorations(state) {
  const grammar = requireLatexTextmateGrammar()
  const builder = new RangeSetBuilder()
  let ruleStack = INITIAL

  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber)
    const lineResult = grammar.tokenizeLine(line.text, ruleStack)
    ruleStack = lineResult.ruleStack

    for (const token of lineResult.tokens) {
      if (token.endIndex <= token.startIndex) continue
      const className = classifyTextmateScopes(token.scopes)
      if (!className) continue

      builder.add(
        line.from + token.startIndex,
        line.from + token.endIndex,
        getDecorationForClasses(className)
      )
    }
  }

  return builder.finish()
}

export function createLatexTextmateHighlightExtension() {
  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.decorations = buildLatexTextmateDecorations(view.state)
      }

      update(update) {
        if (update.docChanged) {
          this.decorations = buildLatexTextmateDecorations(update.state)
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
