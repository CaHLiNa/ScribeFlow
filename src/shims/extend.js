function isArray(value) {
  return Array.isArray(value)
}

function isPlainObject(value) {
  if (!value || Object.prototype.toString.call(value) !== '[object Object]') return false

  const hasOwnConstructor = Object.prototype.hasOwnProperty.call(value, 'constructor')
  const prototypeHasIsPrototypeOf = value.constructor
    && value.constructor.prototype
    && Object.prototype.hasOwnProperty.call(value.constructor.prototype, 'isPrototypeOf')

  if (value.constructor && !hasOwnConstructor && !prototypeHasIsPrototypeOf) {
    return false
  }

  let key
  for (key in value) {
    // Intentionally empty: we only need the final enumerated key.
  }

  return key === undefined || Object.prototype.hasOwnProperty.call(value, key)
}

function assignValue(target, name, newValue) {
  if (name === '__proto__') {
    Object.defineProperty(target, name, {
      enumerable: true,
      configurable: true,
      value: newValue,
      writable: true,
    })
    return
  }

  target[name] = newValue
}

function readValue(target, name) {
  if (name === '__proto__') {
    if (Object.prototype.hasOwnProperty.call(target, name)) {
      return Object.getOwnPropertyDescriptor(target, name)?.value
    }
    return undefined
  }

  return target[name]
}

function extend(...args) {
  let deep = false
  let target = args[0]
  let index = 1

  if (typeof target === 'boolean') {
    deep = target
    target = args[1] || {}
    index = 2
  }

  if (target == null || (typeof target !== 'object' && typeof target !== 'function')) {
    target = {}
  }

  for (; index < args.length; index += 1) {
    const source = args[index]
    if (source == null) continue

    for (const key in source) {
      const currentValue = readValue(target, key)
      const nextValue = readValue(source, key)

      if (target === nextValue) continue

      const nextIsArray = isArray(nextValue)
      const nextIsObject = isPlainObject(nextValue)

      if (deep && nextValue && (nextIsObject || nextIsArray)) {
        const base = nextIsArray
          ? (isArray(currentValue) ? currentValue : [])
          : (isPlainObject(currentValue) ? currentValue : {})
        assignValue(target, key, extend(true, base, nextValue))
        continue
      }

      if (nextValue !== undefined) {
        assignValue(target, key, nextValue)
      }
    }
  }

  return target
}

export default extend
