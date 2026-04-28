export function createLatexPreferenceState() {
  return {
    compilerPreference: 'auto',
    enginePreference: 'auto',
    autoCompile: false,
    formatOnSave: false,
    buildExtraArgs: '',
    customSystemTexPath: '',
  }
}
