import { StreamLanguage } from '@codemirror/language'

function createAltalsStexMode(mathMode = false) {
  function pushCommand(state, command) {
    state.cmdState.push(command)
  }

  function peekCommand(state) {
    return state.cmdState.length > 0 ? state.cmdState[state.cmdState.length - 1] : null
  }

  function popCommand(state) {
    const plugin = state.cmdState.pop()
    if (plugin) plugin.closeBracket()
  }

  function getMostPowerful(state) {
    const context = state.cmdState
    for (let index = context.length - 1; index >= 0; index -= 1) {
      const plugin = context[index]
      if (plugin.name === 'DEFAULT') continue
      return plugin
    }
    return { styleIdentifier: () => null }
  }

  function addPluginPattern(pluginName, commandStyle, styles) {
    return function PluginPattern() {
      this.name = pluginName
      this.bracketNo = 0
      this.style = commandStyle
      this.styles = styles
      this.argument = null

      this.styleIdentifier = function styleIdentifier() {
        return this.styles[this.bracketNo - 1] || null
      }
      this.openBracket = function openBracket() {
        this.bracketNo += 1
        return 'bracket'
      }
      this.closeBracket = function closeBracket() {}
    }
  }

  const plugins = {}

  plugins.importmodule = addPluginPattern('importmodule', 'tag', ['string', 'builtin'])
  plugins.documentclass = addPluginPattern('documentclass', 'tag', ['', 'atom'])
  plugins.usepackage = addPluginPattern('usepackage', 'tag', ['atom'])
  plugins.begin = addPluginPattern('begin', 'tag', ['atom'])
  plugins.end = addPluginPattern('end', 'tag', ['atom'])

  plugins.label = addPluginPattern('label', 'tag', ['atom'])
  plugins.ref = addPluginPattern('ref', 'tag', ['atom'])
  plugins.eqref = addPluginPattern('eqref', 'tag', ['atom'])
  plugins.cite = addPluginPattern('cite', 'tag', ['atom'])
  plugins.bibitem = addPluginPattern('bibitem', 'tag', ['atom'])
  plugins.Bibitem = addPluginPattern('Bibitem', 'tag', ['atom'])
  plugins.RBibitem = addPluginPattern('RBibitem', 'tag', ['atom'])

  plugins.DEFAULT = function DefaultPlugin() {
    this.name = 'DEFAULT'
    this.style = 'tag'
    this.styleIdentifier = this.openBracket = this.closeBracket = function noop() {}
  }

  function setState(state, nextState) {
    state.f = nextState
  }

  function normal(source, state) {
    let plugin

    if (source.match(/^\\[a-zA-Z@\xc0-\u1fff\u2060-\uffff]+/)) {
      const commandName = source.current().slice(1)
      const PluginCtor = Object.prototype.hasOwnProperty.call(plugins, commandName)
        ? plugins[commandName]
        : plugins.DEFAULT
      plugin = new PluginCtor()
      pushCommand(state, plugin)
      setState(state, beginParams)
      return plugin.style
    }

    if (source.match(/^\\[$&%#{}_]/)) return 'tag'
    if (source.match(/^\\[,;!\/\\]/)) return 'tag'

    if (source.match('\\[')) {
      setState(state, (nextSource, nextState) => inMathMode(nextSource, nextState, '\\]'))
      return 'keyword'
    }
    if (source.match('\\(')) {
      setState(state, (nextSource, nextState) => inMathMode(nextSource, nextState, '\\)'))
      return 'keyword'
    }
    if (source.match('$$')) {
      setState(state, (nextSource, nextState) => inMathMode(nextSource, nextState, '$$'))
      return 'keyword'
    }
    if (source.match('$')) {
      setState(state, (nextSource, nextState) => inMathMode(nextSource, nextState, '$'))
      return 'keyword'
    }

    const ch = source.next()
    if (ch === '%') {
      source.skipToEnd()
      return 'comment'
    }
    if (ch === '}' || ch === ']') {
      plugin = peekCommand(state)
      if (plugin) {
        plugin.closeBracket(ch)
        setState(state, beginParams)
      } else {
        return 'error'
      }
      return 'bracket'
    }
    if (ch === '{' || ch === '[') {
      plugin = new plugins.DEFAULT()
      pushCommand(state, plugin)
      return 'bracket'
    }
    if (/\d/.test(ch)) {
      source.eatWhile(/[\w.%]/)
      return 'atom'
    }

    source.eatWhile(/[\w\-_]/)
    plugin = getMostPowerful(state)
    if (plugin.name === 'begin') {
      plugin.argument = source.current()
    }
    return plugin.styleIdentifier()
  }

  function inMathMode(source, state, endModeSeq) {
    if (source.eatSpace()) return null
    if (endModeSeq && source.match(endModeSeq)) {
      setState(state, normal)
      return 'keyword'
    }
    if (source.match(/^\\[a-zA-Z@]+/)) return 'tag'
    if (source.match(/^[a-zA-Z]+/)) return 'variableName.special'
    if (source.match(/^\\[$&%#{}_]/)) return 'tag'
    // The upstream legacy stex mode misses `\\` here, which marks valid
    // multiline math line breaks as errors.
    if (source.match(/^\\[,;!\/\\]/)) return 'tag'
    if (source.match(/^[\^_&]/)) return 'tag'
    if (source.match(/^[+\-<>|=,\/@!*:;'"`~#?]/)) return null
    if (source.match(/^(\d+\.\d*|\d*\.\d+|\d+)/)) return 'number'

    const ch = source.next()
    if (ch === '{' || ch === '}' || ch === '[' || ch === ']' || ch === '(' || ch === ')') {
      return 'bracket'
    }
    if (ch === '%') {
      source.skipToEnd()
      return 'comment'
    }
    return 'error'
  }

  function beginParams(source, state) {
    const ch = source.peek()
    if (ch === '{' || ch === '[') {
      const lastPlugin = peekCommand(state)
      lastPlugin.openBracket(ch)
      source.eat(ch)
      setState(state, normal)
      return 'bracket'
    }
    if (/[ \t\r]/.test(ch)) {
      source.eat(ch)
      return null
    }

    setState(state, normal)
    popCommand(state)
    return normal(source, state)
  }

  return {
    name: 'altals-stex',
    startState() {
      const initialState = mathMode ? (source, state) => inMathMode(source, state) : normal
      return {
        cmdState: [],
        f: initialState,
      }
    },
    copyState(state) {
      return {
        cmdState: state.cmdState.slice(),
        f: state.f,
      }
    },
    token(stream, state) {
      return state.f(stream, state)
    },
    blankLine(state) {
      state.f = normal
      state.cmdState.length = 0
    },
    languageData: {
      commentTokens: { line: '%' },
    },
  }
}

export const altalsLatexLanguage = StreamLanguage.define(createAltalsStexMode(false))

