function definePrototypeMethod(target, name, implementation) {
  if (typeof target[name] === 'function') return
  Object.defineProperty(target, name, {
    value: implementation,
    configurable: true,
    writable: true,
  })
}

definePrototypeMethod(Map.prototype, 'getOrInsertComputed', function getOrInsertComputed(key, callbackfn) {
  if (typeof callbackfn !== 'function') {
    throw new TypeError('Map.prototype.getOrInsertComputed callback must be a function')
  }
  if (this.has(key)) return this.get(key)
  const normalizedKey = Object.is(key, -0) ? 0 : key
  const value = callbackfn(normalizedKey)
  this.set(normalizedKey, value)
  return value
})

definePrototypeMethod(Map.prototype, 'getOrInsert', function getOrInsert(key, value) {
  if (this.has(key)) return this.get(key)
  const normalizedKey = Object.is(key, -0) ? 0 : key
  this.set(normalizedKey, value)
  return value
})

definePrototypeMethod(WeakMap.prototype, 'getOrInsertComputed', function getOrInsertComputed(key, callbackfn) {
  if (typeof callbackfn !== 'function') {
    throw new TypeError('WeakMap.prototype.getOrInsertComputed callback must be a function')
  }
  if (this.has(key)) return this.get(key)
  const value = callbackfn(key)
  this.set(key, value)
  return value
})

definePrototypeMethod(WeakMap.prototype, 'getOrInsert', function getOrInsert(key, value) {
  if (this.has(key)) return this.get(key)
  this.set(key, value)
  return value
})

if (typeof Promise.withResolvers !== 'function') {
  Object.defineProperty(Promise, 'withResolvers', {
    value() {
      let resolve
      let reject
      const promise = new Promise((innerResolve, innerReject) => {
        resolve = innerResolve
        reject = innerReject
      })
      return { promise, resolve, reject }
    },
    configurable: true,
    writable: true,
  })
}
