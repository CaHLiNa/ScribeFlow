export async function activate(context) {
  const translateTreeView = context.views.createTreeView("examplePdfExtension.translateView")
  const launchCount = Number(context.globalState.get("launchCount") || 0) + 1
  context.globalState.update("launchCount", launchCount)
  let lastSettingsChange = ""
  let lastResultPath = ""

  context.menus.registerAction("scribeflow.pdf.translate", {
    surface: "commandPalette",
    title: "Translate",
    category: "PDF",
    when: "resourceExtname == .pdf || resource.kind == pdf",
  })
  context.menus.registerAction("scribeflow.pdf.translate", {
    surface: "pdf.preview.actions",
    title: "Translate",
    category: "PDF",
    when: "resource.kind == pdf",
  })
  context.menus.registerAction("examplePdfExtension.refreshTranslateView", {
    surface: "view/title",
    title: "Refresh Translate View",
    category: "PDF",
    when: "activeView == extension:examplePdfExtension.tools",
  })
  context.menus.registerAction("examplePdfExtension.refreshTranslateView", {
    surface: "view/item/context",
    title: "Refresh Translate View",
    category: "PDF",
    when: "viewItem.contextValue == translation-group",
  })

  function currentDocumentTarget() {
    return context.documents?.target || { kind: "", path: "" }
  }

  function currentResource() {
    return context.documents?.resource || { kind: "", path: "", filename: "" }
  }

  function currentReference() {
    return context.references?.current || { id: "", hasReference: false, pdfPath: "" }
  }

  function currentPdf() {
    return context.pdf?.current || { path: "", isPdf: false, filename: "", referenceId: "" }
  }

  function buildSidebarSections(overrides = {}) {
    const resource = currentResource()
    const reference = currentReference()
    const pdf = currentPdf()
    const targetPath = String(overrides.targetPath || pdf.path || resource.path || "")
    const targetLang = String(
      overrides.targetLang ||
      context.settings.get("examplePdfExtension.targetLang", "zh-CN") ||
      "zh-CN",
    )
    return [
      {
        id: "target",
        kind: "context",
        title: "Target",
        value: targetPath || "No active PDF",
      },
      {
        id: "reference",
        kind: "context",
        title: "Reference",
        value: reference.id || "No linked reference",
      },
      {
        id: "language",
        kind: "config",
        title: "Target Language",
        value: targetLang,
      },
      {
        id: "provider",
        kind: "status",
        title: "Provider",
        value: String(overrides.providerStatus || "Example runtime provider"),
      },
    ]
  }

  function buildResultEntries(overrides = {}) {
    const targetPath = String(overrides.targetPath || lastResultPath || currentPdf().path || currentResource().path || "")
    if (!targetPath) return []
    const targetLang = String(
      overrides.targetLang ||
      context.settings.get("examplePdfExtension.targetLang", "zh-CN") ||
      "zh-CN",
    )
    return [
      {
        id: "source-pdf",
        label: "Open Source PDF",
        description: targetPath,
        path: targetPath,
        action: "open",
        previewMode: "pdf",
        previewPath: targetPath,
        previewTitle: "Source PDF Preview",
        mediaType: "application/pdf",
      },
      {
        id: "open-tab-source-pdf",
        label: "Open PDF In Editor",
        description: "Open the current source PDF as a workspace tab",
        path: targetPath,
        targetPath,
        targetKind: "pdf",
        action: "open-tab",
        previewMode: "pdf",
        previewPath: targetPath,
        previewTitle: "Source PDF Preview",
        mediaType: "application/pdf",
      },
      {
        id: "reveal-source-pdf",
        label: "Reveal Source PDF",
        description: "Reveal the current translation input in Finder",
        path: targetPath,
        action: "reveal",
        mediaType: "application/pdf",
      },
      {
        id: "copy-target-language",
        label: "Copy Target Language",
        description: `Copy current language preset (${targetLang})`,
        action: "copy-text",
        payload: {
          text: targetLang,
        },
      },
      {
        id: "rerun-translation-command",
        label: "Run Translation Again",
        description: "Execute the translation command for the current target again",
        action: "execute-command",
        commandId: "scribeflow.pdf.translate",
        targetKind: "pdf",
        targetPath,
        payload: {
          settings: {
            targetLang,
          },
        },
      },
      ...(currentReference().id
        ? [{
            id: "open-reference-record",
            label: "Open Reference Record",
            description: "Jump to the linked reference in the library",
            action: "open-reference",
            referenceId: currentReference().id,
          }]
        : []),
    ]
  }

  function updateSidebarView(overrides = {}) {
    const hasWorkspace = context.workspace?.hasWorkspace
    context.views.updateView("examplePdfExtension.translateView", {
      title: "Translate PDF",
      description: overrides.description ?? (hasWorkspace ? "Workspace PDF tools" : "PDF tools"),
      message: overrides.message ?? "",
      badgeValue: overrides.badgeValue ?? 1,
      badgeTooltip: overrides.badgeTooltip ?? "One quick action is available for the active PDF.",
      statusLabel: overrides.statusLabel ?? "Ready",
      statusTone: overrides.statusTone ?? "success",
      actionLabel: overrides.actionLabel ?? "Use Translate or Refresh to continue",
      sections: overrides.sections ?? buildSidebarSections(overrides),
      resultEntries: overrides.resultEntries ?? buildResultEntries(overrides),
      artifacts: Array.isArray(overrides.artifacts) ? overrides.artifacts : [],
      outputs: Array.isArray(overrides.outputs) ? overrides.outputs : [],
    })
  }

  context.capabilities.registerProvider("pdf.translate", async (request) => {
    const payload = JSON.parse(String(request?.settingsJson || request?.settings_json || "{}") || "{}")
    const configuredTargetLang = String(
      context.settings.get("examplePdfExtension.targetLang", "zh-CN") || "zh-CN",
    )
    const targetLang = String(payload?.["examplePdfExtension.targetLang"] || payload?.targetLang || configuredTargetLang)
    const workspaceRoot = String(context.workspace?.rootPath || "")
    const resource = currentResource()
    const reference = currentReference()
    lastResultPath = String(request?.targetPath || resource.path || "")
    const translationArtifactPath = lastResultPath
      ? `${lastResultPath}.${targetLang}.translation.txt`
      : ""
    const worker = await context.process.spawn("node", {
      args: [
        "-e",
        [
          "const fs = require('node:fs')",
          "const path = require('node:path')",
          "const targetPath = process.argv[1] || ''",
          "const targetLang = process.argv[2] || 'zh-CN'",
          "const explicitOutputPath = process.argv[3] || ''",
          "const outputDir = process.argv[4] || process.cwd()",
          "const targetName = targetPath ? targetPath.split(/[\\\\/]/).pop() : 'current-pdf.pdf'",
          "const outputPath = explicitOutputPath || path.join(outputDir, `${targetName}.${targetLang}.translation.txt`)",
          "fs.writeFileSync(outputPath, `translated:${targetLang}\\nsource:${targetPath || 'none'}\\nprovider:example-pdf-extension\\n`)",
          "setTimeout(() => process.exit(0), 25)",
        ].join(";"),
        lastResultPath,
        targetLang,
        translationArtifactPath,
        workspaceRoot || process.cwd(),
      ],
      cwd: workspaceRoot || "",
    })
    await context.tasks.update({
      state: "running",
      progressLabel: `Translating ${lastResultPath || "current PDF"} to ${targetLang}`,
    })
    const waited = await worker.wait()
    updateSidebarView({
      targetLang,
      targetPath: lastResultPath,
      providerStatus: waited?.ok ? "Completed through local worker" : "Local worker failed",
      statusLabel: waited?.ok ? "Completed" : "Failed",
      statusTone: waited?.ok ? "success" : "warning",
      actionLabel: waited?.ok ? "Review result or rerun with another language" : "Review the task log and rerun",
      message: waited?.ok
        ? `Translated ${lastResultPath || "current PDF"}${reference.id ? ` · ref:${reference.id}` : ""}`
        : `Translation failed for ${lastResultPath || "current PDF"}${reference.id ? ` · ref:${reference.id}` : ""}`,
      artifacts: waited?.ok && translationArtifactPath
        ? [
            {
              id: "translation-text-output",
              kind: "translated-text",
              mediaType: "text/plain",
              path: translationArtifactPath,
              sourcePath: resource.path || lastResultPath,
            },
            ...(lastResultPath
              ? [{
                  id: "translated-pdf-artifact",
                  kind: "translated-pdf",
                  mediaType: "application/pdf",
                  path: lastResultPath,
                  sourcePath: resource.path || lastResultPath,
                }]
              : []),
          ]
        : [],
      outputs: waited?.ok
        ? [
            {
              id: "translation-summary-preview",
              type: "inlineText",
              mediaType: "text/plain",
              title: "Translation Summary",
              description: lastResultPath || "Translation summary",
              text: [
                `Target: ${lastResultPath || "No active PDF"}`,
                `Reference: ${currentReference().id || "None"}`,
                `Language: ${targetLang}`,
                `Provider: example-pdf-extension`,
              ].join("\n"),
            },
            {
              id: "translation-html-preview",
              type: "inlineHtml",
              mediaType: "text/html",
              title: "Translation HTML Preview",
              description: lastResultPath || "Translation result card",
              html: `
                <html>
                  <body style="font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif; margin: 0; padding: 20px; background: #fffdf8; color: #181512;">
                    <h2 style="margin: 0 0 8px; font-size: 18px;">Example Translation Result</h2>
                    <p style="margin: 0 0 14px; color: #5b5349;">This is a mock preview surface for future translated output.</p>
                    <div style="padding: 12px 14px; border: 1px solid #e6ded2; border-radius: 10px; background: #ffffff;">
                      <div style="font-size: 12px; color: #6e6256; text-transform: uppercase; letter-spacing: .04em;">Target</div>
                      <div style="margin-top: 4px; font-size: 14px;">${lastResultPath || "No active PDF"}</div>
                    </div>
                  </body>
                </html>
              `,
            },
          ]
        : [],
    })
    return {
      message: waited?.ok
        ? `example-pdf-extension translated ${request?.capability || "unknown"} for ${targetLang}${resource.path ? ` · ${resource.path}` : ""}${reference.id ? ` · ref:${reference.id}` : ""}${workspaceRoot ? ` · ${workspaceRoot}` : ""}`
        : `example-pdf-extension failed to translate ${request?.capability || "unknown"} for ${targetLang}`,
      progressLabel: waited?.ok ? "Translation completed" : "Translation failed",
      taskState: waited?.ok ? "succeeded" : "failed",
      outputs: waited?.ok
        ? [
            {
              id: "translation-result-card",
              type: "inlineHtml",
              mediaType: "text/html",
              title: "Translation HTML Preview",
              description: lastResultPath || "Translation result card",
              html: `
                <html>
                  <body style="font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif; margin: 0; padding: 20px; background: #fffdf8; color: #181512;">
                    <h2 style="margin: 0 0 8px; font-size: 18px;">Example Translation Result</h2>
                    <p style="margin: 0 0 14px; color: #5b5349;">This is a mock preview surface for future translated output.</p>
                    <div style="padding: 12px 14px; border: 1px solid #e6ded2; border-radius: 10px; background: #ffffff;">
                      <div style="font-size: 12px; color: #6e6256; text-transform: uppercase; letter-spacing: .04em;">Target</div>
                      <div style="margin-top: 4px; font-size: 14px;">${lastResultPath || "No active PDF"}</div>
                    </div>
                  </body>
                </html>
              `,
            },
          ]
        : [],
      artifacts: waited?.ok && translationArtifactPath
        ? [
            {
              id: "translated-text-artifact",
              kind: "translated-text",
              mediaType: "text/plain",
              path: translationArtifactPath,
              sourcePath: resource.path || lastResultPath,
            },
            ...(lastResultPath
              ? [{
                  id: "translated-pdf-artifact",
                  kind: "translated-pdf",
                  mediaType: "application/pdf",
                  path: lastResultPath,
                  sourcePath: resource.path || lastResultPath,
                }]
              : []),
          ]
        : [],
    }
  })

  context.commands.registerCommand("scribeflow.pdf.translate", async (payload) => {
    const targetLang = await context.window.showQuickPick(
      [
        { label: "Chinese (Simplified)", description: "zh-CN", value: "zh-CN" },
        { label: "English", description: "en", value: "en" },
      ],
      {
        title: "Translation target language",
        placeHolder: "Choose translation language",
      },
    )
    if (!targetLang) {
      await context.window.showWarningMessage("Translation cancelled")
      return {
        message: "example-pdf-extension cancelled translation",
        progressLabel: "Translation cancelled",
      }
    }
    const activeTarget = currentDocumentTarget()
    const targetPath = String(payload?.targetPath || activeTarget.path || "")
    lastResultPath = targetPath
    const result = await context.capabilities.invoke("pdf.translate", {
      ...payload,
      capability: "pdf.translate",
      targetLang,
      targetPath,
    })
    await context.window.showInformationMessage(`PDF translation queued for ${targetPath || "current target"}`)
    return result
  }, {
    title: "Translate",
    category: "PDF",
    when: "resourceExtname == .pdf || resource.kind == pdf",
  })

  context.commands.registerCommand("examplePdfExtension.announceRefresh", async () => {
    const note = await context.window.showInputBox({
      title: "Refresh note",
      prompt: "Annotate this refresh action",
      placeHolder: "Optional note",
      value: "Translate view refreshed",
    })
    await context.window.showInformationMessage(String(note || "Translate view refreshed"))
    return {
      message: "example-pdf-extension announced refresh",
      progressLabel: "Refresh notification sent",
    }
  }, {
    title: "Announce Refresh",
    category: "PDF",
  })

  context.commands.registerCommand("examplePdfExtension.captureContext", async () => {
    const resource = currentResource()
    const reference = currentReference()
    const pdf = currentPdf()
    updateSidebarView({
      description: context.workspace?.hasWorkspace
        ? `Workspace PDF tools · launched ${launchCount} times`
        : `PDF tools · launched ${launchCount} times`,
      message: `Context: ${pdf.path || resource.path || "none"}${reference.id ? ` · ref:${reference.id}` : ""}${lastSettingsChange ? ` · settings:${lastSettingsChange}` : ""}`,
      statusLabel: pdf.path || resource.path ? "Context Ready" : "Waiting",
      statusTone: pdf.path || resource.path ? "success" : "warning",
      actionLabel: "Inspect the active document context",
      targetPath: pdf.path || resource.path || "",
      providerStatus: "Context probe",
    })
    context.views.refresh("examplePdfExtension.translateView")
    return {
      message: `captured context${reference.id ? ` for ${reference.id}` : ""}`,
      progressLabel: "Context captured",
    }
  }, {
    title: "Capture Context",
    category: "PDF",
  })

  context.commands.registerCommand("examplePdfExtension.inspectRuntimeApis", async () => {
    const pdf = currentPdf()
    const library = await context.references.readCurrentLibrary()
    const metadata = pdf.path ? await context.pdf.extractMetadata(pdf.path) : {}
    updateSidebarView({
      description: context.workspace?.hasWorkspace
        ? `Workspace PDF tools · launched ${launchCount} times`
        : `PDF tools · launched ${launchCount} times`,
      message: `Runtime APIs: refs:${Array.isArray(library?.references) ? library.references.length : 0}${metadata?.metadata?.title ? ` · title:${metadata.metadata.title}` : ""}`,
      statusLabel: "Runtime Ready",
      statusTone: "success",
      actionLabel: "Host APIs are available to this plugin",
      targetPath: pdf.path || "",
      providerStatus: metadata?.metadata?.title ? "Metadata resolved" : "Metadata unavailable",
    })
    context.views.refresh("examplePdfExtension.translateView")
    return {
      message: "example-pdf-extension inspected runtime apis",
      progressLabel: "Runtime APIs inspected",
    }
  }, {
    title: "Inspect Runtime APIs",
    category: "PDF",
  })

  context.commands.registerCommand("examplePdfExtension.inspectPdfApi", async () => {
    const pdf = currentPdf()
    const candidatePdfPath = String(
      pdf.path ||
      currentDocumentTarget().path ||
      currentResource().path ||
      "",
    )
    const metadata = candidatePdfPath ? await context.pdf.extractMetadata(candidatePdfPath) : {}
    updateSidebarView({
      description: context.workspace?.hasWorkspace
        ? `Workspace PDF tools · launched ${launchCount} times`
        : `PDF tools · launched ${launchCount} times`,
      message: metadata?.metadata?.title
        ? `PDF API: title:${metadata.metadata.title}`
        : "PDF API: metadata unavailable",
      statusLabel: "PDF Ready",
      statusTone: "success",
      actionLabel: "PDF metadata is available to this plugin",
      targetPath: candidatePdfPath,
      providerStatus: metadata?.metadata?.title ? "Metadata resolved" : "Metadata unavailable",
    })
    context.views.refresh("examplePdfExtension.translateView")
    return {
      message: "example-pdf-extension inspected pdf api",
      progressLabel: "PDF API inspected",
    }
  }, {
    title: "Inspect PDF API",
    category: "PDF",
  })

  context.commands.registerCommand("examplePdfExtension.inspectPdfTextApi", async () => {
    const pdf = currentPdf()
    const candidatePdfPath = String(
      pdf.path ||
      currentDocumentTarget().path ||
      currentResource().path ||
      "",
    )
    const extractedText = candidatePdfPath ? await context.pdf.extractText(candidatePdfPath) : ""
    updateSidebarView({
      description: context.workspace?.hasWorkspace
        ? `Workspace PDF tools · launched ${launchCount} times`
        : `PDF tools · launched ${launchCount} times`,
      message: extractedText
        ? `PDF Text API: ${String(extractedText).slice(0, 48)}`
        : "PDF Text API: no text extracted",
      statusLabel: "PDF Text Ready",
      statusTone: "success",
      actionLabel: "PDF text extraction is available to this plugin",
      targetPath: candidatePdfPath,
      providerStatus: extractedText ? "Text extracted" : "No text extracted",
    })
    context.views.refresh("examplePdfExtension.translateView")
    return {
      message: "example-pdf-extension inspected pdf text api",
      progressLabel: "PDF text API inspected",
    }
  }, {
    title: "Inspect PDF Text API",
    category: "PDF",
  })

  context.commands.registerCommand("examplePdfExtension.inspectProcessApi", async () => {
    const result = await context.process.spawn("node", {
      args: ["-e", "setTimeout(() => process.exit(0), 25)"],
      cwd: context.workspace?.rootPath || "",
    })
    await context.tasks.update({
      state: "running",
      progressLabel: `Spawned process ${String(result?.pid || "").trim() || "pending"}`,
    })
    const waited = await result.wait()
    await context.tasks.update({
      state: waited?.ok ? "succeeded" : "failed",
      progressLabel: waited?.ok
        ? `Process ${String(waited?.pid || result?.pid || "").trim() || "done"} completed`
        : `Process ${String(waited?.pid || result?.pid || "").trim() || "done"} failed`,
      error: waited?.ok ? "" : `Process exited with code ${String(waited?.code ?? "unknown")}`,
    })
    updateSidebarView({
      description: context.workspace?.hasWorkspace
        ? `Workspace PDF tools · launched ${launchCount} times`
        : `PDF tools · launched ${launchCount} times`,
      message: `Process API: pid ${String(result?.pid || "").trim() || "empty"} · exit ${String(waited?.code ?? "unknown")}`,
      statusLabel: waited?.ok ? "Process Complete" : "Process Failed",
      statusTone: waited?.ok ? "success" : "warning",
      actionLabel: waited?.ok ? "Spawn and wait completed" : "Spawn completed with failure",
      providerStatus: waited?.ok ? "Local process spawn+wait ok" : "Local process returned non-zero exit",
    })
    context.views.refresh("examplePdfExtension.translateView")
    return {
      message: "example-pdf-extension inspected process api",
      progressLabel: waited?.ok ? "Process API inspected" : "Process API failed",
      taskState: waited?.ok ? "succeeded" : "failed",
    }
  }, {
    title: "Inspect Process API",
    category: "PDF",
  })

  context.commands.registerCommand("examplePdfExtension.inspectProcessExecApi", async () => {
    const result = await context.process.exec("node", {
      args: ["-e", "process.stdout.write('exec-ok')"],
      cwd: context.workspace?.rootPath || "",
    })
    updateSidebarView({
      description: context.workspace?.hasWorkspace
        ? `Workspace PDF tools · launched ${launchCount} times`
        : `PDF tools · launched ${launchCount} times`,
      message: `Process Exec API: ${String(result?.stdout || "").trim() || "no stdout"}`,
      statusLabel: result?.ok ? "Process Exec Complete" : "Process Exec Failed",
      statusTone: result?.ok ? "success" : "warning",
      actionLabel: result?.ok ? "Local process exec completed" : "Local process exec failed",
      providerStatus: result?.ok ? "Local process exec ok" : "Local process exec returned non-zero exit",
    })
    context.views.refresh("examplePdfExtension.translateView")
    return {
      message: "example-pdf-extension inspected process exec api",
      progressLabel: result?.ok ? "Process exec API inspected" : "Process exec API failed",
      taskState: result?.ok ? "succeeded" : "failed",
    }
  }, {
    title: "Inspect Process Exec API",
    category: "PDF",
  })

  context.views.registerTreeDataProvider("examplePdfExtension.translateView", {
    getTitle() {
      return "Translate PDF"
    },
    async getChildren(element, payload) {
      const targetPath = String(payload?.targetPath || currentDocumentTarget().path || "")
      if (!element) {
        return [
          {
            id: "translate-group",
            handle: "translate-group",
            kind: "group",
            targetPath,
          },
        ]
      }
      if (String(element?.handle || element?.id || "") === "translate-group") {
        return [
          {
            id: "translate-current-pdf",
            handle: targetPath ? `translate-current-pdf:${targetPath}` : "translate-current-pdf",
            kind: "translate-target",
            targetPath,
          },
        ]
      }
      return []
    },
    async getTreeItem(element) {
      if (String(element?.kind || "") === "group") {
        return {
          id: "translate-group",
          handle: "translate-group",
          label: "Translation Actions",
          description: "Commands for the current PDF target.",
          tooltip: "Expand to inspect the available translation actions.",
          contextValue: "translation-group",
          icon: "folder",
          collapsibleState: "collapsed",
        }
      }
      const targetPath = String(element?.targetPath || "")
      const label = targetPath ? targetPath.split(/[\\/]/).pop() : "Current PDF"
      return {
        id: "translate-current-pdf",
        handle: String(element?.handle || "translate-current-pdf"),
        label,
        description: "Run the PDF translation command for the current target.",
        tooltip: targetPath || "Translate the current PDF target.",
        contextValue: "translation-target",
        icon: "file",
        commandId: "scribeflow.pdf.translate",
        commandArguments: [
          {
            source: "treeItem",
            targetPath,
          },
        ],
        collapsibleState: "none",
      }
    },
  }, {
    title: "Translate PDF",
    when: "resourceExtname == .pdf || resource.kind == pdf",
  })

  updateSidebarView({
    message: currentPdf().path
      ? `Select a PDF target to start translation.${currentReference().id ? ` Reference: ${currentReference().id}` : ""}`
      : "Open a PDF document to start translation.",
    statusLabel: currentPdf().path ? "Ready" : "Waiting",
    statusTone: currentPdf().path ? "success" : "warning",
    actionLabel: currentPdf().path ? "Choose a translation target" : "Open a PDF document first",
    targetPath: currentPdf().path || "",
  })

  context.settings.onDidChange((event) => {
    const keys = Array.isArray(event?.keys) ? event.keys.filter(Boolean) : []
    if (keys.length === 0) return
    lastSettingsChange = keys.join(", ")
    updateSidebarView({
      description: context.workspace?.hasWorkspace
        ? `Workspace PDF tools · launched ${launchCount} times`
        : `PDF tools · launched ${launchCount} times`,
      message: `Settings updated: ${lastSettingsChange}`,
      statusLabel: "Settings Updated",
      statusTone: "warning",
      actionLabel: "Review the new provider defaults",
      providerStatus: `Settings changed: ${lastSettingsChange}`,
    })
  })

  translateTreeView.onDidChangeSelection((event) => {
    const selected = Array.isArray(event?.selection) ? event.selection[0] : null
    const label = String(selected?.targetPath || selected?.label || selected?.handle || "")
    context.workspaceState.update("lastSelectedLabel", label)
    lastResultPath = label || lastResultPath
    updateSidebarView({
      message: label
        ? `Selected translation target: ${label}`
        : "Select a PDF target to start translation.",
      description: `Workspace PDF tools · launched ${launchCount} times`,
      statusLabel: label ? "Target Selected" : "Ready",
      statusTone: label ? "success" : "warning",
      actionLabel: label ? "Run Translate to queue work" : "Select a translation target",
      targetPath: label || currentPdf().path || "",
    })
  })

  context.commands.registerCommand("examplePdfExtension.refreshTranslateView", async () => {
    await context.commands.executeCommand("examplePdfExtension.announceRefresh")
    const resource = currentResource()
    context.views.refresh("examplePdfExtension.translateView")
    updateSidebarView({
      description: context.workspace?.hasWorkspace
        ? `Workspace PDF tools · launched ${launchCount} times`
        : `PDF tools · launched ${launchCount} times`,
      message: resource.path
        ? `Ready for ${resource.filename || resource.path}${currentReference().id ? ` · ref:${currentReference().id}` : ""}`
        : "Open a PDF document to start translation.",
      statusLabel: resource.path ? "Ready" : "Waiting",
      statusTone: resource.path ? "success" : "warning",
      actionLabel: resource.path ? "Inspect the target or queue translation" : "Open a PDF document first",
      targetPath: resource.path || "",
      providerStatus: "Refreshed from runtime",
    })
    translateTreeView.reveal("translate-group", {
      focus: true,
      select: true,
      expand: true,
    })
    return {
      message: "example-pdf-extension refreshed sidebar view",
      progressLabel: "Example view refreshed",
    }
  }, {
    title: "Refresh Translate View",
    category: "PDF",
  })
}

export async function deactivate() {}
