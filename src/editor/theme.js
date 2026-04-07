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
    '.cm-tooltip.cm-tinymist-hover': {
      maxWidth: '420px',
      maxHeight: 'min(44vh, 360px)',
      padding: '0',
      overflow: 'auto',
      borderRadius: '12px',
      border: '1px solid color-mix(in srgb, var(--border) 72%, transparent)',
      backgroundColor: 'color-mix(in srgb, var(--bg-secondary) 94%, black 6%)',
      boxShadow: '0 18px 42px rgba(0, 0, 0, 0.32)',
      zIndex: '40',
    },
    '.cm-tooltip.cm-tinymist-signature': {
      maxWidth: '420px',
      padding: '0',
      overflow: 'hidden',
      borderRadius: '12px',
      border: '1px solid color-mix(in srgb, var(--border) 72%, transparent)',
      backgroundColor: 'color-mix(in srgb, var(--bg-secondary) 96%, black 4%)',
      boxShadow: '0 18px 42px rgba(0, 0, 0, 0.32)',
      zIndex: '40',
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
    '.cm-tinymist-hover__body': {
      padding: '12px 14px',
      lineHeight: '1.55',
      fontSize: 'var(--ui-font-size)',
      wordBreak: 'break-word',
    },
    '.cm-tinymist-signature__body': {
      padding: '10px 12px',
      lineHeight: '1.45',
      fontSize: 'var(--ui-font-size)',
    },
    '.cm-tinymist-signature__label': {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--ui-font-code)',
      color: 'var(--fg-primary)',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    },
    '.cm-tinymist-signature__param': {
      color: 'var(--accent)',
      fontWeight: '700',
    },
    '.cm-tinymist-signature__hint': {
      marginTop: '8px',
      color: 'var(--fg-secondary)',
      fontSize: 'var(--ui-font-label)',
      lineHeight: '1.5',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
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
    '.cm-tinymist-doc-link': {
      color: 'var(--hl-link)',
      textDecoration: 'underline dotted',
      textUnderlineOffset: '2px',
    },
    '.cm-typst-inlay-hint': {
      color: 'color-mix(in srgb, var(--fg-muted) 90%, var(--accent) 10%)',
      fontSize: 'var(--ui-font-micro)',
      fontStyle: 'italic',
      opacity: '0.88',
      pointerEvents: 'none',
      userSelect: 'none',
      whiteSpace: 'nowrap',
    },
    '.cm-typst-inlay-hint-pad-left': {
      marginLeft: '0.35em',
    },
    '.cm-typst-inlay-hint-pad-right': {
      marginRight: '0.35em',
    },
    '.cm-tinymist-hover__body p': {
      margin: '0 0 8px 0',
    },
    '.cm-tinymist-hover__body p:last-child': {
      marginBottom: '0',
    },
    '.cm-tinymist-hover__body pre': {
      margin: '8px 0 0 0',
      padding: '8px 10px',
      borderRadius: '6px',
      backgroundColor: 'var(--bg-primary)',
      overflowX: 'auto',
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--ui-font-code)',
    },
    '.cm-tinymist-hover__body code': {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--ui-font-code)',
    },
    '.cm-tinymist-hover__body a': {
      color: 'var(--hl-link)',
      textDecoration: 'underline',
    },
    '.cm-tinymist-token-comment': {
      color: 'var(--hl-comment)',
      fontStyle: 'italic',
    },
    '.cm-tinymist-token-string': {
      color: 'var(--hl-string)',
    },
    '.cm-tinymist-token-keyword': {
      color: 'var(--hl-keyword)',
      fontWeight: '600',
    },
    '.cm-tinymist-token-operator, .cm-tinymist-token-punct, .cm-tinymist-token-delim': {
      color: 'var(--hl-punctuation)',
    },
    '.cm-tinymist-token-number, .cm-tinymist-token-bool': {
      color: 'var(--hl-number)',
    },
    '.cm-tinymist-token-function': {
      color: 'var(--hl-function)',
    },
    '.cm-tinymist-token-decorator': {
      color: 'var(--hl-decorator)',
    },
    '.cm-tinymist-token-type, .cm-tinymist-token-namespace': {
      color: 'var(--hl-type)',
    },
    '.cm-tinymist-token-escape': {
      color: 'var(--hl-escape)',
      fontWeight: '700',
    },
    '.cm-tinymist-token-link, .cm-tinymist-token-ref': {
      color: 'var(--hl-link)',
      textDecoration: 'underline',
    },
    '.cm-tinymist-token-raw': {
      color: 'var(--hl-code)',
      fontFamily: 'var(--font-mono)',
    },
    '.cm-tinymist-token-label, .cm-tinymist-token-term, .cm-tinymist-token-pol': {
      color: 'var(--hl-attribute)',
      fontWeight: '600',
    },
    '.cm-tinymist-token-heading': {
      color: 'var(--hl-heading)',
      fontWeight: '700',
    },
    '.cm-tinymist-token-marker': {
      color: 'var(--hl-heading-minor)',
      fontWeight: '700',
    },
    '.cm-tinymist-token-error': {
      color: 'var(--error)',
      textDecoration: 'underline wavy',
    },
    '.cm-tinymist-mod-strong': {
      fontWeight: '700',
    },
    '.cm-tinymist-mod-emph': {
      fontStyle: 'italic',
    },
    '.cm-tinymist-mod-math': {
      color: 'var(--hl-number)',
    },
    '.cm-tinymist-mod-readonly, .cm-tinymist-mod-static, .cm-tinymist-mod-defaultLibrary': {
      opacity: '0.92',
    },
    '.cm-typst-heading-mark': {
      color: 'var(--hl-heading-minor)',
      fontWeight: '700',
    },
    '.cm-typst-heading-text': {
      color: 'var(--hl-heading)',
      fontWeight: '700',
    },
    '.cm-typst-command-mark': {
      color: 'var(--hl-keyword)',
      fontWeight: '700',
    },
    '.cm-typst-command': {
      color: 'var(--hl-function)',
    },
    '.cm-typst-citation': {
      color: 'var(--accent)',
      fontWeight: '600',
    },
    '.cm-typst-label': {
      color: 'var(--hl-attribute)',
      fontWeight: '600',
    },
    '.cm-typst-label-ref': {
      color: 'var(--hl-link)',
      textDecoration: 'underline dotted',
    },
    '.cm-typst-comment': {
      color: 'var(--hl-comment)',
      fontStyle: 'italic',
    },
    '.cm-typst-string': {
      color: 'var(--hl-string)',
    },
    '.cm-typst-math': {
      color: 'var(--hl-number)',
    },
    '.cm-typst-diagnostic-line': {
      backgroundColor: 'rgba(245, 158, 11, 0.08)',
    },
    '.cm-typst-diagnostic-line-error': {
      boxShadow: 'inset 3px 0 0 rgba(239, 68, 68, 0.75)',
    },
    '.cm-typst-diagnostic-line-warning': {
      boxShadow: 'inset 3px 0 0 rgba(245, 158, 11, 0.7)',
    },
    '.cm-typst-diagnostic-line-active': {
      backgroundColor: 'rgba(239, 68, 68, 0.12)',
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
  { tag: tags.quote, color: 'var(--fg-secondary)', fontStyle: 'italic' },
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
  { tag: tags.variableName, color: 'var(--fg-primary)' },
  { tag: tags.definition(tags.variableName), color: 'var(--fg-primary)' },
  { tag: tags.function(tags.variableName), color: 'var(--hl-function)' },
  { tag: tags.function(tags.definition(tags.variableName)), color: 'var(--hl-function)' },
  { tag: tags.constant(tags.variableName), color: 'var(--hl-constant)' },
  { tag: tags.standard(tags.variableName), color: 'var(--hl-function)' },
  { tag: tags.local(tags.variableName), color: 'var(--fg-primary)' },
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
