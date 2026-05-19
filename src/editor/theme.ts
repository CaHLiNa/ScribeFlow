import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'

export const shouldersTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'var(--shell-editor-surface)',
      color: 'var(--workspace-ink)',
    },
    '.cm-content': {
      caretColor: 'var(--accent)',
      fontFamily: "var(--font-mono)",
      padding: '18px 0 26px',
      lineHeight: '1.6',
    },
    '.cm-scroller': {
      backgroundColor: 'var(--shell-editor-surface)',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--accent)',
      borderLeftWidth: '2px',
    },
    '.cm-activeLine': {
      backgroundColor: 'var(--editor-active-line)',
    },
    '.cm-reveal-target-line': {
      backgroundColor: 'color-mix(in srgb, var(--accent) 14%, transparent)',
      boxShadow: 'inset 3px 0 0 color-mix(in srgb, var(--accent) 78%, white 22%)',
      outline: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
      outlineOffset: '-1px',
    },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
      backgroundColor: 'var(--editor-selection) !important',
    },
    '.cm-selectionMatch': {
      backgroundColor: 'var(--editor-selection-match)',
    },
    '.cm-selectionMatch.cm-selectionMatch-main': {
      backgroundColor: 'var(--editor-selection-match)',
      outline: '1px solid color-mix(in srgb, var(--editor-selection-match) 70%, var(--accent) 30%)',
    },
    '.cm-searchMatch .cm-selectionMatch': {
      backgroundColor: 'transparent',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--shell-editor-surface)',
      color: 'var(--fg-muted)',
      border: 'none',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'transparent',
      color: 'var(--fg-secondary)',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      boxSizing: 'border-box',
      minWidth: '28px',
      padding: '0 4px 0 0',
      textAlign: 'right',
    },
    '.cm-foldGutter': {
      minWidth: '12px',
    },
    '.cm-foldGutter .cm-gutterElement': {
      boxSizing: 'border-box',
      width: '12px',
      padding: '0 2px 0 0',
    },
    '.cm-matchingBracket': {
      backgroundColor: 'var(--editor-bracket-match)',
      outline: '1px solid var(--editor-bracket-border)',
    },
    '.cm-searchMatch': {
      backgroundColor: 'var(--editor-search-match)',
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: 'var(--editor-search-match)',
      outline: '1px solid var(--accent)',
    },
    '.cm-panels': {
      backgroundColor: 'var(--bg-secondary)',
      color: 'var(--fg-primary)',
    },
    '.cm-panels.cm-panels-top': {
      borderBottom: '1px solid var(--border)',
    },
    '.cm-panels.cm-panels-bottom': {
      borderTop: '1px solid var(--border)',
    },
    '.cm-button': {
      backgroundColor: 'var(--bg-tertiary)',
      backgroundImage: 'none',
      color: 'var(--fg-primary)',
      border: '1px solid var(--border)',
      borderRadius: '4px',
      padding: '2px 8px',
      cursor: 'pointer',
    },
    '.cm-textfield': {
      backgroundColor: 'var(--bg-primary)',
      color: 'var(--fg-primary)',
      border: '1px solid var(--border)',
      borderRadius: '4px',
    },
    '.cm-tooltip': {
      backgroundColor: 'var(--bg-secondary)',
      border: '1px solid var(--border)',
      color: 'var(--fg-primary)',
    },
    '.cm-tooltip-autocomplete': {
      '& > ul > li': {
        padding: '4px 8px',
      },
      '& > ul > li[aria-selected]': {
        backgroundColor: 'var(--bg-hover)',
        color: 'var(--fg-primary)',
      },
    },
    '.cm-tooltip.cm-markdown-draft-hover': {
      maxWidth: '420px',
      maxHeight: 'min(42vh, 340px)',
      padding: '0',
      overflow: 'auto',
      borderRadius: '12px',
      border: '1px solid color-mix(in srgb, var(--border) 72%, transparent)',
      backgroundColor: 'color-mix(in srgb, var(--bg-secondary) 96%, black 4%)',
      boxShadow: '0 18px 42px rgba(0, 0, 0, 0.28)',
      zIndex: '40',
    },
    '.cm-markdown-draft-hover__body': {
      padding: '12px 14px',
      lineHeight: '1.5',
      fontSize: 'var(--ui-font-size)',
    },
    '.cm-markdown-draft-hover__eyebrow': {
      marginBottom: '6px',
      color: 'var(--fg-muted)',
      fontSize: '11px',
      fontWeight: '700',
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
    },
    '.cm-markdown-draft-hover__title': {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--ui-font-code)',
      color: 'var(--accent)',
      marginBottom: '6px',
      wordBreak: 'break-word',
    },
    '.cm-markdown-draft-hover__headline': {
      color: 'var(--fg-primary)',
      fontWeight: '600',
      lineHeight: '1.45',
      marginBottom: '6px',
      wordBreak: 'break-word',
    },
    '.cm-markdown-draft-hover__meta': {
      color: 'var(--fg-secondary)',
      fontSize: 'var(--ui-font-label)',
      lineHeight: '1.45',
    },
    '.cm-markdown-draft-hover__meta--missing': {
      color: 'var(--warning)',
      fontWeight: '600',
    },
    '.cm-markdown-draft-hover__submeta': {
      marginTop: '4px',
      color: 'var(--fg-muted)',
      fontSize: 'var(--ui-font-micro)',
      lineHeight: '1.45',
      wordBreak: 'break-word',
    },
    '.cm-markdown-draft-hover__math': {
      padding: '8px 10px',
      borderRadius: '8px',
      backgroundColor: 'color-mix(in srgb, var(--bg-primary) 88%, transparent)',
      border: '1px solid color-mix(in srgb, var(--border) 70%, transparent)',
      overflowX: 'auto',
      overflowY: 'hidden',
    },
    '.cm-markdown-draft-hover__math.is-display': {
      padding: '10px 12px',
    },
    '.cm-markdown-draft-hover__code': {
      marginTop: '8px',
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--ui-font-code)',
      color: 'var(--fg-secondary)',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    },
    '.cm-tm-comment': {
      color: 'var(--hl-comment)',
      fontStyle: 'italic',
    },
    '.cm-tm-punctuation': {
      color: 'var(--hl-punctuation)',
    },
    '.cm-tm-operator': {
      color: 'var(--hl-operator)',
    },
    '.cm-tm-command-punctuation': {
      color: 'var(--latex-command-punctuation)',
    },
    '.cm-tm-package-class': {
      color: 'var(--latex-package-class)',
    },
    '.cm-tm-preamble-value': {
      color: 'var(--latex-preamble-value)',
    },
    '.cm-tm-option-value': {
      color: 'var(--latex-option-value)',
    },
    '.cm-tm-arg-brace': {
      color: 'var(--latex-arg-brace)',
    },
    '.cm-tm-optional-brace': {
      color: 'var(--latex-optional-brace)',
    },
    '.cm-tm-begin-end': {
      color: 'var(--latex-begin-end)',
    },
    '.cm-tm-environment-name': {
      color: 'var(--latex-environment-name)',
    },
    '.cm-tm-item-command': {
      color: 'var(--latex-item-command)',
    },
    '.cm-tm-function-definition': {
      color: 'var(--latex-function-definition)',
    },
    '.cm-tm-definition-target': {
      color: 'var(--latex-definition-target)',
    },
    '.cm-tm-general-command': {
      color: 'var(--latex-general-command)',
    },
    '.cm-tm-section-command': {
      color: 'var(--latex-section-command)',
    },
    '.cm-tm-section-title': {
      color: 'var(--latex-section-title)',
    },
    '.cm-tm-text-command': {
      color: 'var(--latex-text-command)',
    },
    '.cm-tm-link-function': {
      color: 'var(--latex-link-function)',
    },
    '.cm-tm-link-target': {
      color: 'var(--latex-link-target)',
      textDecoration: 'underline',
      textDecorationThickness: '0.08em',
    },
    '.cm-tm-citation-command': {
      color: 'var(--latex-citation-command)',
    },
    '.cm-tm-reference-command': {
      color: 'var(--latex-reference-command)',
    },
    '.cm-tm-label-command': {
      color: 'var(--latex-label-command)',
    },
    '.cm-tm-citation-key': {
      color: 'var(--latex-citation-key)',
    },
    '.cm-tm-label-name': {
      color: 'var(--latex-label-name)',
    },
    '.cm-tm-raw': {
      color: 'var(--hl-code)',
    },
    '.cm-tm-emphasis': {
      color: 'var(--hl-emphasis)',
      fontStyle: 'italic',
    },
    '.cm-tm-strong': {
      color: 'var(--fg-primary)',
      fontWeight: '700',
    },
    '.cm-tm-preamble, .cm-tm-preamble-command': {
      color: 'var(--latex-preamble-command)',
    },
    '.cm-tm-include, .cm-tm-include-command': {
      color: 'var(--latex-include-command)',
    },
    '.cm-tm-layout-command': {
      color: 'var(--latex-layout-command)',
    },
    '.cm-tm-math-delimiter': {
      color: 'var(--latex-math-delimiter)',
    },
    '.cm-tm-math-structure, .cm-tm-math-structure-command, .cm-tm-math-environment-name': {
      color: 'var(--latex-math-structure)',
    },
    '.cm-tm-math-bracket': {
      color: 'var(--latex-math-bracket)',
    },
    '.cm-tm-math-command-punctuation': {
      color: 'var(--latex-math-command-punctuation)',
    },
    '.cm-tm-math-variable': {
      color: 'var(--latex-math-variable)',
    },
    '.cm-tm-math-symbol': {
      color: 'var(--latex-math-symbol)',
    },
    '.cm-tm-math-function': {
      color: 'var(--latex-math-function)',
    },
    '.cm-tm-math-operator': {
      color: 'var(--latex-math-operator)',
    },
    '.cm-tm-math-newline': {
      color: 'var(--latex-math-newline)',
    },
    '.cm-tm-math-alignment': {
      color: 'var(--latex-math-alignment)',
    },
    '.cm-tm-escape': {
      color: 'var(--latex-escape)',
    },
  },
  { dark: true }
)

export const shouldersHighlightStyle = HighlightStyle.define([
  // ── Markdown / prose ──────────────────────────────────
  { tag: tags.heading1, color: 'var(--hl-heading)', fontWeight: 'bold', fontSize: '1.4em' },
  { tag: tags.heading2, color: 'var(--hl-heading)', fontWeight: 'bold', fontSize: '1.25em' },
  { tag: tags.heading3, color: 'var(--hl-heading)', fontWeight: 'bold', fontSize: '1.1em' },
  { tag: tags.heading4, color: 'var(--hl-heading-minor)', fontWeight: 'bold' },
  { tag: tags.heading5, color: 'var(--hl-heading-minor)', fontWeight: 'bold' },
  { tag: tags.heading6, color: 'var(--hl-heading-minor)', fontWeight: 'bold' },
  { tag: tags.emphasis, color: 'var(--hl-emphasis)', fontStyle: 'italic' },
  { tag: tags.strong, color: 'var(--fg-primary)', fontWeight: 'bold' },
  { tag: tags.strikethrough, textDecoration: 'line-through', color: 'var(--fg-muted)' },
  { tag: tags.link, color: 'var(--hl-link)', textDecoration: 'underline' },
  { tag: tags.url, color: 'var(--hl-link)' },
  { tag: tags.monospace, color: 'var(--hl-code)', fontFamily: "var(--font-mono)" },
  { tag: tags.quote, color: 'var(--hl-quote)', fontStyle: 'italic' },
  { tag: tags.list, color: 'var(--hl-list)' },
  { tag: tags.contentSeparator, color: 'var(--fg-muted)' },

  // ── Comments ──────────────────────────────────────────
  { tag: tags.comment, color: 'var(--hl-comment)', fontStyle: 'italic' },
  { tag: tags.lineComment, color: 'var(--hl-comment)', fontStyle: 'italic' },
  { tag: tags.blockComment, color: 'var(--hl-comment)', fontStyle: 'italic' },
  { tag: tags.docComment, color: 'var(--hl-comment)', fontStyle: 'italic' },

  // ── Strings & literals ────────────────────────────────
  { tag: tags.string, color: 'var(--hl-string)' },
  { tag: tags.docString, color: 'var(--hl-string)', fontStyle: 'italic' },
  { tag: tags.character, color: 'var(--hl-string)' },
  { tag: tags.special(tags.string), color: 'var(--hl-string)' },
  { tag: tags.regexp, color: 'var(--hl-regexp)' },
  { tag: tags.escape, color: 'var(--hl-escape)', fontWeight: 'bold' },
  { tag: tags.number, color: 'var(--hl-number)' },
  { tag: tags.integer, color: 'var(--hl-number)' },
  { tag: tags.float, color: 'var(--hl-number)' },
  { tag: tags.bool, color: 'var(--hl-constant)' },
  { tag: tags.null, color: 'var(--hl-constant)' },
  { tag: tags.atom, color: 'var(--hl-constant)' },

  // ── Keywords (differentiated) ─────────────────────────
  { tag: tags.keyword, color: 'var(--hl-keyword)' },
  { tag: tags.controlKeyword, color: 'var(--hl-ctrl-keyword)' },
  { tag: tags.definitionKeyword, color: 'var(--hl-def-keyword)' },
  { tag: tags.moduleKeyword, color: 'var(--hl-module-keyword)' },
  { tag: tags.operatorKeyword, color: 'var(--hl-keyword)' },
  { tag: tags.modifier, color: 'var(--hl-keyword)' },
  { tag: tags.self, color: 'var(--hl-self)' },
  { tag: tags.unit, color: 'var(--hl-number)' },

  // ── Names ─────────────────────────────────────────────
  { tag: tags.variableName, color: 'var(--hl-variable)' },
  { tag: tags.definition(tags.variableName), color: 'var(--hl-variable)' },
  { tag: tags.function(tags.variableName), color: 'var(--hl-function)' },
  { tag: tags.function(tags.definition(tags.variableName)), color: 'var(--hl-function)' },
  { tag: tags.constant(tags.variableName), color: 'var(--hl-constant)' },
  { tag: tags.standard(tags.variableName), color: 'var(--hl-support)' },
  { tag: tags.local(tags.variableName), color: 'var(--hl-variable)' },
  { tag: tags.special(tags.variableName), color: 'var(--hl-constant)' },

  // ── Types & classes ───────────────────────────────────
  { tag: tags.typeName, color: 'var(--hl-type)' },
  { tag: tags.className, color: 'var(--hl-class)' },
  { tag: tags.definition(tags.className), color: 'var(--hl-class)' },
  { tag: tags.definition(tags.typeName), color: 'var(--hl-type)' },
  { tag: tags.standard(tags.typeName), color: 'var(--hl-type)' },
  { tag: tags.namespace, color: 'var(--hl-type)' },
  { tag: tags.macroName, color: 'var(--hl-decorator)' },

  // ── Properties & attributes ───────────────────────────
  { tag: tags.propertyName, color: 'var(--hl-property)' },
  { tag: tags.function(tags.propertyName), color: 'var(--hl-function)' },
  { tag: tags.definition(tags.propertyName), color: 'var(--hl-property)' },
  { tag: tags.special(tags.propertyName), color: 'var(--hl-property)' },
  { tag: tags.attributeName, color: 'var(--hl-attribute)' },
  { tag: tags.attributeValue, color: 'var(--hl-string)' },

  // ── HTML / XML tags ───────────────────────────────────
  { tag: tags.tagName, color: 'var(--hl-tag)' },
  { tag: tags.standard(tags.tagName), color: 'var(--hl-tag)' },
  { tag: tags.angleBracket, color: 'var(--hl-punctuation)' },

  // ── Operators ─────────────────────────────────────────
  { tag: tags.operator, color: 'var(--hl-operator)' },
  { tag: tags.arithmeticOperator, color: 'var(--hl-operator)' },
  { tag: tags.logicOperator, color: 'var(--hl-operator)' },
  { tag: tags.bitwiseOperator, color: 'var(--hl-operator)' },
  { tag: tags.compareOperator, color: 'var(--hl-operator)' },
  { tag: tags.updateOperator, color: 'var(--hl-operator)' },
  { tag: tags.definitionOperator, color: 'var(--hl-operator)' },
  { tag: tags.typeOperator, color: 'var(--hl-operator)' },
  { tag: tags.derefOperator, color: 'var(--hl-punctuation)' },

  // ── Punctuation & brackets ────────────────────────────
  { tag: tags.punctuation, color: 'var(--hl-punctuation)' },
  { tag: tags.separator, color: 'var(--hl-punctuation)' },
  { tag: tags.bracket, color: 'var(--hl-bracket)' },
  { tag: tags.paren, color: 'var(--hl-bracket)' },
  { tag: tags.squareBracket, color: 'var(--hl-bracket)' },
  { tag: tags.brace, color: 'var(--hl-bracket)' },

  // ── Meta & decorators ─────────────────────────────────
  { tag: tags.meta, color: 'var(--hl-decorator)' },
  { tag: tags.annotation, color: 'var(--hl-decorator)' },
  { tag: tags.processingInstruction, color: 'var(--fg-muted)' },
  { tag: tags.labelName, color: 'var(--hl-heading-minor)' },

  // ── CSS-specific ──────────────────────────────────────
  { tag: tags.color, color: 'var(--hl-constant)' },

  // ── Diff ──────────────────────────────────────────────
  { tag: tags.inserted, color: 'var(--success)' },
  { tag: tags.deleted, color: 'var(--error)' },
  { tag: tags.changed, color: 'var(--warning)' },

  // ── Invalid ───────────────────────────────────────────
  { tag: tags.invalid, color: 'var(--error)', textDecoration: 'underline wavy' },
])

export const shouldersHighlighting = syntaxHighlighting(shouldersHighlightStyle)
