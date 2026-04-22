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
  ['markup.underline.link', 'cm-tm-link-target'],
  ['markup.bold', 'cm-tm-strong'],
  ['markup.italic', 'cm-tm-emphasis'],
  ['markup.raw', 'cm-tm-raw'],
  ['meta.embedded.block', 'cm-tm-raw'],
  ['meta.function.embedded', 'cm-tm-raw'],
  ['entity.name.section', 'cm-tm-section-title'],
  ['constant.other.reference.citation', 'cm-tm-citation-key'],
  ['constant.other.reference.label', 'cm-tm-label-name'],
  ['variable.parameter.definition.label', 'cm-tm-label-name'],
  ['storage.type.function', 'cm-tm-function-definition'],
  ['storage.type', 'cm-tm-function-definition'],
  ['keyword.other.item', 'cm-tm-item-command'],
  ['keyword.control.cite', 'cm-tm-citation-command'],
  ['keyword.control.ref', 'cm-tm-reference-command'],
  ['keyword.control.label', 'cm-tm-label-command'],
  ['keyword.control.include', 'cm-tm-include-command'],
  ['keyword.control.preamble', 'cm-tm-preamble-command'],
  ['keyword.control.layout', 'cm-tm-layout-command'],
  ['keyword.control.equation.newline', 'cm-tm-math-newline'],
  ['keyword.control.equation.align', 'cm-tm-math-alignment'],
  ['support.function.be', 'cm-tm-begin-end'],
  ['support.function.url', 'cm-tm-link-function'],
  ['support.function.section', 'cm-tm-section-command'],
  ['support.function.textbf', 'cm-tm-text-command'],
  ['support.function.textit', 'cm-tm-text-command'],
  ['support.function.texttt', 'cm-tm-text-command'],
  ['support.function.emph', 'cm-tm-text-command'],
  ['support.function.verb', 'cm-tm-text-command'],
  ['support.function.general', 'cm-tm-general-command'],
  ['support.class.math.block.environment', 'cm-tm-math-variable'],
  ['support.class.math.block.tex', 'cm-tm-math-variable'],
  ['support.class.latex', 'cm-tm-package-class'],
  ['constant.character.math', 'cm-tm-math-symbol'],
  ['constant.other.general.math', 'cm-tm-math-function'],
  ['constant.other.math', 'cm-tm-math-function'],
  ['constant.character.escape', 'cm-tm-escape'],
  ['meta.preamble', 'cm-tm-preamble'],
  ['meta.include', 'cm-tm-include'],
  ['punctuation.definition.constant.math', 'cm-tm-math-command-punctuation'],
  ['punctuation.definition.arguments.optional.begin', 'cm-tm-optional-brace'],
  ['punctuation.definition.arguments.optional.end', 'cm-tm-optional-brace'],
  ['punctuation.definition.arguments.begin', 'cm-tm-arg-brace'],
  ['punctuation.definition.arguments.end', 'cm-tm-arg-brace'],
  ['punctuation.definition.begin', 'cm-tm-arg-brace'],
  ['punctuation.definition.end', 'cm-tm-arg-brace'],
  ['punctuation.definition.string.begin.tex', 'cm-tm-math-delimiter'],
  ['punctuation.definition.string.end.tex', 'cm-tm-math-delimiter'],
  ['punctuation.definition.brackets.tex', 'cm-tm-math-bracket'],
  ['punctuation.math.bracket.pair.big', 'cm-tm-math-bracket'],
  ['punctuation.math.begin.bracket', 'cm-tm-math-bracket'],
  ['punctuation.math.end.bracket', 'cm-tm-math-bracket'],
  ['punctuation.math.operator', 'cm-tm-math-operator'],
  ['keyword.operator', 'cm-tm-operator'],
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
  const hasScope = (prefix) => scopes.some((scope) => scope.startsWith(prefix))

  if (hasScope('punctuation.definition.function') || hasScope('punctuation.definition.keyword')) {
    if (hasScope('storage.type.function')) {
      classes.add('cm-tm-function-definition')
    } else if (hasScope('keyword.control.preamble')) {
      classes.add('cm-tm-preamble-command')
    } else if (hasScope('support.function.be')) {
      classes.add('cm-tm-begin-end')
    } else if (hasScope('support.function.section')) {
      classes.add('cm-tm-section-command')
    } else if (hasScope('support.function.url')) {
      classes.add('cm-tm-link-function')
    } else if (hasScope('keyword.control.label')) {
      classes.add('cm-tm-label-command')
    } else if (hasScope('keyword.control.cite')) {
      classes.add('cm-tm-citation-command')
    } else if (hasScope('keyword.control.ref')) {
      classes.add('cm-tm-reference-command')
    } else if (hasScope('keyword.control.include')) {
      classes.add('cm-tm-include-command')
    } else if (hasScope('keyword.control.layout')) {
      classes.add('cm-tm-layout-command')
    } else if (hasScope('keyword.other.item')) {
      classes.add('cm-tm-item-command')
    } else if (hasScope('support.function.general')) {
      classes.add('cm-tm-general-command')
    } else {
      classes.add('cm-tm-command-punctuation')
    }
  }

  if (hasScope('punctuation.definition.constant.math')) {
    if (hasScope('constant.other.general.math') || hasScope('constant.other.math')) {
      classes.add('cm-tm-math-function')
    } else if (hasScope('constant.character.math')) {
      classes.add('cm-tm-math-symbol')
    }
  }

  if (hasScope('variable.parameter.function')) {
    if (hasScope('meta.parameter.optional')) {
      classes.add('cm-tm-option-value')
    } else if (hasScope('meta.function.environment')) {
      classes.add('cm-tm-environment-name')
    }
  }

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
