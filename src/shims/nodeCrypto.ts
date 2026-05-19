export function randomBytes() {
  throw new Error('Node crypto is not available in the browser build')
}

export default {
  randomBytes,
}
