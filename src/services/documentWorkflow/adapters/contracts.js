/**
 * @typedef {Object} DocumentAdapterContext
 * @property {Object} [workflowStore]
 * @property {Object} [latexStore]
 * @property {Object} [typstStore]
 * @property {Object} [editorStore]
 * @property {Object} [filesStore]
 * @property {Object} [toastStore]
 * @property {Object} [referencesStore]
 * @property {Object} [workspace]
 * @property {Object | null} [previewState]
 * @property {string} [previewKind]
 * @property {string} [previewMode]
 * @property {boolean} [previewAvailable]
 * @property {boolean} [previewVisible]
 * @property {string} [previewTargetPath]
 * @property {string} [targetResolution]
 * @property {Function} [t]
 */

/**
 * @typedef {Object} PreviewAdapter
 * @property {string} defaultKind
 * @property {string[]} supportedKinds
 * @property {(sourcePath: string, previewKind: string) => string | null} createPath
 * @property {(sourcePath: string, previewPath: string) => string | null} inferKind
 * @property {(sourcePath: string, context: DocumentAdapterContext, options?: Object) => string | null} [getTargetPath]
 * @property {(sourcePath: string, context: DocumentAdapterContext, options?: Object) => boolean} [isNativeSupported]
 * @property {(sourcePath: string, context: DocumentAdapterContext, options?: Object) => any} [ensure]
 * @property {(sourcePath: string, context: DocumentAdapterContext, options?: Object) => any} [reveal]
 */

/**
 * @typedef {Object} CitationSyntaxAdapter
 * @property {(filePath: string) => boolean} supportsInsertion
 * @property {(filePath: string, keys: string[] | string, options?: Object) => string} buildText
 */

/**
 * @typedef {Object} CompileAdapter
 * @property {string} id
 * @property {(filePath: string, context: DocumentAdapterContext) => Object | null} stateForFile
 * @property {(filePath: string, context: DocumentAdapterContext, options?: Object) => Promise<boolean> | boolean} [ensureReady]
 * @property {(filePath: string, context: DocumentAdapterContext, options?: Object) => Promise<any>} compile
 * @property {(filePath: string, context: DocumentAdapterContext) => any[]} getDiagnostics
 * @property {(filePath: string, context: DocumentAdapterContext) => string | null} [getArtifactPath]
 * @property {(filePath: string, context: DocumentAdapterContext) => string} [getStatusText]
 * @property {(filePath: string, context: DocumentAdapterContext) => void} [openLog]
 */

/**
 * @typedef {Object} DocumentAdapter
 * @property {string} kind
 * @property {(filePath: string) => boolean} matchesFile
 * @property {(filePath: string) => boolean} supportsWorkflowSource
 * @property {PreviewAdapter} preview
 * @property {CitationSyntaxAdapter} citationSyntax
 * @property {CompileAdapter | null} [compile]
 * @property {(filePath: string, context: DocumentAdapterContext) => any[]} getProblems
 * @property {(filePath: string, context: DocumentAdapterContext) => Object | null} getUiState
 */

export {}
