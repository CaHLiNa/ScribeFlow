import { StreamLanguage } from '@codemirror/language'

const MATH_ENVIRONMENTS = new Set([
  'align',
  'align*',
  'displaymath',
  'eqnarray',
  'eqnarray*',
  'equation',
  'equation*',
  'flalign',
  'flalign*',
  'gather',
  'gather*',
  'math',
  'math*',
  'multline',
  'multline*',
  'split',
  'tikzcd',
])

const VERBATIM_ENVIRONMENTS = new Set([
  'Verbatim',
  'comment',
  'lstlisting',
  'minted',
  'sageblock',
  'sagesilent',
  'spverbatim',
  'verbatim',
])

const COMMAND_ROLE_TOKENS = Object.freeze({
  'heading-1': 'heading1',
  'heading-2': 'heading2',
  'heading-3': 'heading3',
  'heading-4': 'heading4',
  'heading-5': 'heading5',
  'heading-6': 'heading6',
  emphasis: 'emphasis',
  strong: 'strong',
  label: 'labelName',
  citation: 'atom',
  'env-name': 'typeName',
  'macro-definition': 'macroName',
  option: 'attributeName',
  path: 'string.special',
  'package-list': 'string',
  'class-name': 'string',
})

function cloneArgs(args = []) {
  return args.map((arg) => ({ ...arg }))
}

function createArg(open, role, extras = {}) {
  return {
    open,
    close: open === '[' ? ']' : '}',
    role,
    optional: false,
    capture: false,
    ...extras,
  }
}

function addDelimitedMatch(stream, text, style) {
  if (stream.match(text)) {
    return style
  }
  return null
}

function topGroup(state) {
  return state.groupStack.length > 0 ? state.groupStack[state.groupStack.length - 1] : null
}

function activeInheritedRole(state) {
  for (let index = state.groupStack.length - 1; index >= 0; index -= 1) {
    const role = state.groupStack[index]?.inheritRole
    if (role) return role
  }
  return null
}

function appendCapture(state, text = '') {
  if (!text) return
  const group = topGroup(state)
  if (!group || !group.capture) return
  group.captureText += text
}

function clearPendingCommand(state) {
  state.pendingArgs = []
  state.pendingCommand = null
}

function resolveNextArg(state, opener) {
  while (state.pendingArgs.length > 0) {
    const nextArg = state.pendingArgs[0]
    if (nextArg.open === opener) {
      state.pendingArgs.shift()
      if (state.pendingArgs.length === 0) {
        state.pendingCommand = null
      }
      return nextArg
    }
    if (nextArg.optional) {
      state.pendingArgs.shift()
      continue
    }
    break
  }
  return null
}

function pushGroup(state, opener) {
  const arg = resolveNextArg(state, opener)
  const inheritedRole = activeInheritedRole(state)
  state.groupStack.push({
    close: opener === '[' ? ']' : '}',
    role: arg?.role || null,
    capture: arg?.capture === true,
    captureText: '',
    onClose: arg?.onClose || null,
    inheritRole: arg?.inherit === true ? arg.role : inheritedRole,
  })
}

function popGroup(state, closer) {
  const group = state.groupStack.pop()
  if (!group || group.close !== closer) return false
  if (typeof group.onClose === 'function') {
    group.onClose(state, group.captureText.trim())
  }
  return true
}

function pushMath(state, endToken) {
  state.mathStack.push(endToken)
}

function popMath(state, expected = null) {
  if (state.mathStack.length === 0) return
  if (expected == null) {
    state.mathStack.pop()
    return
  }

  for (let index = state.mathStack.length - 1; index >= 0; index -= 1) {
    const current = state.mathStack[index]
    if (current === expected || current?.name === expected) {
      state.mathStack.splice(index, 1)
      return
    }
  }
}

function pushEnvironment(state, name) {
  if (!name) return
  if (MATH_ENVIRONMENTS.has(name)) {
    state.environmentStack.push({ name, kind: 'math' })
    pushMath(state, { kind: 'environment', name })
    return
  }
  if (VERBATIM_ENVIRONMENTS.has(name)) {
    state.environmentStack.push({ name, kind: 'verbatim' })
    return
  }
  state.environmentStack.push({ name, kind: 'generic' })
}

function popEnvironment(state, name) {
  if (!name) return
  for (let index = state.environmentStack.length - 1; index >= 0; index -= 1) {
    const current = state.environmentStack[index]
    if (current.name !== name) continue
    state.environmentStack.splice(index, 1)
    if (current.kind === 'math') {
      popMath(state, name)
    }
    return
  }
}

function currentEnvironment(state) {
  return state.environmentStack.length > 0
    ? state.environmentStack[state.environmentStack.length - 1]
    : null
}

function isVerbatimMode(state) {
  return currentEnvironment(state)?.kind === 'verbatim'
}

function isMathMode(state) {
  return state.mathStack.length > 0
}

function normalizedPendingCommand(state) {
  return String(state.pendingCommand || '').replace(/\*$/, '')
}

function tokenizeOptionGroup(stream, state) {
  if (stream.eatSpace()) {
    appendCapture(state, stream.current())
    return null
  }

  if (stream.match(/^[-A-Za-z@][\w@.:/-]*/)) {
    appendCapture(state, stream.current())
    return 'attributeName'
  }
  if (stream.match(/^(\d+\.\d*|\d*\.\d+|\d+)/)) {
    appendCapture(state, stream.current())
    return 'number'
  }
  if (stream.match(/^[=,:]/)) {
    appendCapture(state, stream.current())
    return 'operator'
  }
  if (stream.match(/^[^=\],{}\s]+/)) {
    appendCapture(state, stream.current())
    return 'string'
  }

  const ch = stream.next()
  appendCapture(state, ch)
  return null
}

function tokenizeDelimitedRole(stream, state, role) {
  if (stream.eatSpace()) {
    appendCapture(state, stream.current())
    return null
  }

  if (stream.match(/^,+/)) {
    appendCapture(state, stream.current())
    return 'separator'
  }

  const token = COMMAND_ROLE_TOKENS[role] || null
  if (!token) return null

  const matchers = {
    'env-name': /^[A-Za-z*._:@/-]+/,
    label: /^[^,\]{}\s%]+/,
    citation: /^[^,\]{}\s%]+/,
    path: /^[^,\]{}\s%]+/,
    'package-list': /^[^,\]{}\s%]+/,
    'class-name': /^[^,\]{}\s%]+/,
    'macro-definition': /^\\[A-Za-z@]+[*]?/,
    'heading-1': /^[^\\{}\[\]%$]+/,
    'heading-2': /^[^\\{}\[\]%$]+/,
    'heading-3': /^[^\\{}\[\]%$]+/,
    'heading-4': /^[^\\{}\[\]%$]+/,
    'heading-5': /^[^\\{}\[\]%$]+/,
    'heading-6': /^[^\\{}\[\]%$]+/,
    emphasis: /^[^\\{}\[\]%$]+/,
    strong: /^[^\\{}\[\]%$]+/,
  }

  const matcher = matchers[role]
  if (matcher && stream.match(matcher)) {
    appendCapture(state, stream.current())
    return token
  }

  const ch = stream.next()
  appendCapture(state, ch)
  return null
}

function applyBeginEnvironment(state, value) {
  pushEnvironment(state, value)
}

function applyEndEnvironment(state, value) {
  popEnvironment(state, value)
}

function commandProfile(commandName) {
  const normalized = commandName.replace(/\*$/, '')

  if (normalized === 'begin') {
    return {
      token: 'moduleKeyword',
      args: [createArg('{', 'env-name', { capture: true, onClose: applyBeginEnvironment })],
    }
  }

  if (normalized === 'end') {
    return {
      token: 'moduleKeyword',
      args: [createArg('{', 'env-name', { capture: true, onClose: applyEndEnvironment })],
    }
  }

  if (normalized === 'documentclass') {
    return {
      token: 'moduleKeyword',
      args: [
        createArg('[', 'option', { optional: true }),
        createArg('{', 'class-name'),
      ],
    }
  }

  if (normalized === 'usepackage') {
    return {
      token: 'moduleKeyword',
      args: [
        createArg('[', 'option', { optional: true }),
        createArg('{', 'package-list'),
      ],
    }
  }

  if (
    [
      'addbibresource',
      'bibliography',
      'bibliographystyle',
      'graphicspath',
      'import',
      'include',
      'includegraphics',
      'includeonly',
      'inkscapeinclude',
      'input',
      'lstinputlisting',
      'subfile',
      'svgpath',
      'tikzlibrary',
      'usemintedstyle',
    ].includes(normalized)
  ) {
    return {
      token: 'moduleKeyword',
      args: [
        createArg('[', 'option', { optional: true }),
        createArg('{', 'path'),
      ],
    }
  }

  if (
    ['title', 'author', 'date', 'subtitle', 'frametitle'].includes(normalized)
  ) {
    return {
      token: 'moduleKeyword',
      args: [createArg('{', 'heading-1', { inherit: true })],
    }
  }

  const headingLevels = new Map([
    ['part', 'heading-2'],
    ['chapter', 'heading-2'],
    ['section', 'heading-3'],
    ['subsection', 'heading-4'],
    ['subsubsection', 'heading-5'],
    ['paragraph', 'heading-6'],
    ['subparagraph', 'heading-6'],
  ])
  if (headingLevels.has(normalized)) {
    return {
      token: 'moduleKeyword',
      args: [
        createArg('[', headingLevels.get(normalized), { optional: true, inherit: true }),
        createArg('{', headingLevels.get(normalized), { inherit: true }),
      ],
    }
  }

  if (['textbf', 'mathbf'].includes(normalized)) {
    return {
      token: 'macroName',
      args: [createArg('{', 'strong', { inherit: true })],
    }
  }

  if (['emph', 'textit', 'mathit', 'intertext', 'shortintertext'].includes(normalized)) {
    return {
      token: 'macroName',
      args: [createArg('{', 'emphasis', { inherit: true })],
    }
  }

  if (normalized === 'item') {
    return {
      token: 'list',
      args: [createArg('[', 'option', { optional: true })],
    }
  }

  if (normalized === 'label') {
    return {
      token: 'macroName',
      args: [createArg('{', 'label')],
    }
  }

  if (/^(?:[A-Za-z]*cite[A-Za-z]*|nocite)$/.test(normalized)) {
    return {
      token: 'macroName',
      args: [
        createArg('[', 'option', { optional: true }),
        createArg('[', 'option', { optional: true }),
        createArg('{', 'citation'),
      ],
    }
  }

  if (/^(?:auto|page|eq|v|V|c|C)?ref(?:range)?$/.test(normalized)) {
    return {
      token: 'macroName',
      args: [createArg('{', 'label')],
    }
  }

  if (
    [
      'DeclareMathOperator',
      'DeclarePairedDelimiter',
      'newcommand',
      'providecommand',
      'renewcommand',
    ].includes(normalized)
  ) {
    return {
      token: 'macroName',
      args: [
        createArg('{', 'macro-definition'),
        createArg('[', 'option', { optional: true }),
        createArg('[', 'option', { optional: true }),
        createArg('{', null, { optional: true }),
      ],
    }
  }

  return {
    token: 'macroName',
    args: [],
  }
}

function readCommand(stream, state) {
  if (!stream.match(/^\\(?:[A-Za-z@]+[*]?|.)/)) return null

  const rawCommand = stream.current().slice(1)
  const profile = commandProfile(rawCommand)
  state.pendingCommand = rawCommand
  state.pendingArgs = cloneArgs(profile.args)
  appendCapture(state, stream.current())
  return profile.token
}

function maybeStartMath(stream, state) {
  const matches = [
    ['\\[', '\\]'],
    ['\\(', '\\)'],
    ['$$', '$$'],
    ['$', '$'],
  ]

  for (const [open, close] of matches) {
    const style = addDelimitedMatch(stream, open, 'keyword')
    if (style) {
      pushMath(state, close)
      appendCapture(state, open)
      return style
    }
  }

  return null
}

function handleGroupBoundary(stream, state) {
  const ch = stream.peek()
  if (ch === '{' || ch === '[') {
    pushGroup(state, ch)
    stream.next()
    return 'bracket'
  }

  if (ch === '}' || ch === ']') {
    stream.next()
    if (!popGroup(state, ch)) {
      return 'invalid'
    }
    appendCapture(state, ch)
    return 'bracket'
  }

  return null
}

function tokenizeDirectiveComment(stream) {
  if (stream.match(/^%%\s*!TeX.*/)) return 'meta'
  if (stream.match(/^%%&.*/)) return 'meta'
  return null
}

function tokenizeSharedText(stream, state) {
  if (stream.eatSpace()) {
    appendCapture(state, stream.current())
    return null
  }

  const directive = stream.sol() ? tokenizeDirectiveComment(stream) : null
  if (directive) return directive

  if (stream.peek() === '%') {
    stream.skipToEnd()
    appendCapture(state, stream.current())
    return 'comment'
  }

  const groupBoundary = handleGroupBoundary(stream, state)
  if (groupBoundary) return groupBoundary

  const mathStart = maybeStartMath(stream, state)
  if (mathStart) return mathStart

  const command = readCommand(stream, state)
  if (command) return command

  if (stream.match(/^#\d+/)) {
    appendCapture(state, stream.current())
    return 'variableName'
  }

  return null
}

function tokenizeVerbatim(stream, state) {
  const env = currentEnvironment(state)
  if (env?.name && stream.match(/^\\end(?=\{)/, false)) {
    return tokenizeText(stream, state)
  }

  const nextEnd = env?.name ? `\\end{${env.name}}` : null
  if (nextEnd) {
    const endIndex = stream.string.indexOf(nextEnd, stream.pos)
    if (endIndex > stream.pos) {
      stream.pos = endIndex
      return 'string'
    }
  }

  if (stream.pos < stream.string.length) {
    stream.skipToEnd()
    return 'string'
  }

  return null
}

function tokenizeMath(stream, state) {
  if (stream.eatSpace()) return null

  if (stream.peek() === '%') {
    stream.skipToEnd()
    return 'comment'
  }

  const exit = state.mathStack[state.mathStack.length - 1]
  if (typeof exit === 'string' && stream.match(exit)) {
    popMath(state, exit)
    return 'keyword'
  }

  const groupBoundary = handleGroupBoundary(stream, state)
  if (groupBoundary) return groupBoundary

  const group = topGroup(state)
  if (group?.role === 'option') {
    return tokenizeOptionGroup(stream, state)
  }
  if (group?.role) {
    const roleToken = tokenizeDelimitedRole(stream, state, group.role)
    if (roleToken) return roleToken
  }

  const command = readCommand(stream, state)
  if (command) return command

  if (stream.match(/^#\d+/)) return 'variableName'
  if (stream.match(/^(\d+\.\d*|\d*\.\d+|\d+)/)) return 'number'
  if (stream.match(/^[A-Za-z]+/)) return 'variableName.special'
  if (stream.match(/^[=+\-*/<>|&,:;!^_]/)) return 'operator'
  if (stream.match(/^[()[\]{}]/)) return 'bracket'

  stream.next()
  return null
}

function tokenizeText(stream, state) {
  const shared = tokenizeSharedText(stream, state)
  if (shared) return shared

  if (state.pendingArgs.length > 0 && !topGroup(state) && !/[\[{]/.test(stream.peek() || '')) {
    clearPendingCommand(state)
  }

  const group = topGroup(state)
  if (group?.role === 'option') {
    return tokenizeOptionGroup(stream, state)
  }

  if (group?.role) {
    const token = tokenizeDelimitedRole(stream, state, group.role)
    if (token) return token
  }

  if (stream.match(/^[A-Za-z][\w-]*/)) {
    appendCapture(state, stream.current())
    return null
  }

  const ch = stream.next()
  appendCapture(state, ch)
  return null
}

function latexToken(stream, state) {
  const group = topGroup(state)
  if (
    isVerbatimMode(state) &&
    normalizedPendingCommand(state) !== 'end' &&
    group?.role !== 'env-name'
  ) {
    return tokenizeVerbatim(stream, state)
  }
  if (isMathMode(state)) return tokenizeMath(stream, state)
  return tokenizeText(stream, state)
}

export const altalsLatexLanguage = StreamLanguage.define({
  name: 'altals-latex',
  startState() {
    return {
      pendingCommand: null,
      pendingArgs: [],
      groupStack: [],
      mathStack: [],
      environmentStack: [],
    }
  },
  copyState(state) {
    return {
      pendingCommand: state.pendingCommand,
      pendingArgs: cloneArgs(state.pendingArgs),
      groupStack: state.groupStack.map((group) => ({ ...group })),
      mathStack: state.mathStack.map((entry) => (
        typeof entry === 'string' ? entry : { ...entry }
      )),
      environmentStack: state.environmentStack.map((entry) => ({ ...entry })),
    }
  },
  token(stream, state) {
    return latexToken(stream, state)
  },
  blankLine(state) {
    clearPendingCommand(state)
    if (!isVerbatimMode(state)) {
      state.groupStack = state.groupStack.filter((group) => group.close !== ']')
    }
  },
  languageData: {
    commentTokens: { line: '%' },
  },
})
