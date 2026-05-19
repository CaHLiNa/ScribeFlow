export async function activate(context) {
  const launchCount = Number(context.globalState.get("launchCount") || 0) + 1
  context.globalState.update("launchCount", launchCount)
  let lastSummary = ""

  context.views.registerTreeDataProvider("exampleMarkdownExtension.notesView", {
    getTitle() {
      return "Note Summary"
    },
    getChildren() {
      return [
        {
          id: "notes-summary",
          handle: "notes-summary",
          label: "Current summary",
          description: lastSummary ? "Latest generated note summary" : "No summary generated yet",
        },
      ]
    },
    getTreeItem(element = {}) {
      return {
        id: element.id || "notes-summary",
        handle: element.handle || "notes-summary",
        label: element.label || "Current summary",
        description: element.description || "",
        contextValue: "note-section",
        collapsibleState: "none",
      }
    },
  }, {
    title: "Note Summary",
    when: "resourceExtname == .md || resource.kind == workspace",
  })

  const treeView = context.views.createTreeView("exampleMarkdownExtension.notesView")

  context.menus.registerAction("scribeflow.markdown.summarize", {
    surface: "commandPalette",
    title: "Summarize Note",
    category: "Notes",
    when: "resourceExtname == .md || resource.kind == workspace",
  })
  context.menus.registerAction("exampleMarkdownExtension.refreshNotesView", {
    surface: "view/title",
    title: "Refresh Notes View",
    category: "Notes",
    when: "activeView == extension:exampleMarkdownExtension.notes",
  })
  context.menus.registerAction("exampleMarkdownExtension.refreshNotesView", {
    surface: "view/item/context",
    title: "Refresh Notes View",
    category: "Notes",
    when: "viewItem.contextValue == note-section",
  })

  function currentResource() {
    return context.documents?.resource || { kind: "", path: "", filename: "" }
  }

  function currentTarget() {
    return context.documents?.target || { kind: "", path: "", referenceId: "" }
  }

  function currentWorkspace() {
    return context.workspace?.current || { rootPath: "", hasWorkspace: false }
  }

  function buildSections(summaryText = lastSummary) {
    const resource = currentResource()
    const workspace = currentWorkspace()
    return [
      {
        id: "target",
        kind: "context",
        title: "Target",
        value: resource.path || currentTarget().path || "No active note",
      },
      {
        id: "workspace",
        kind: "context",
        title: "Workspace",
        value: workspace.rootPath || "No workspace",
      },
      {
        id: "summary",
        kind: "status",
        title: "Summary",
        value: summaryText || "No summary generated yet",
      },
    ]
  }

  function buildResultEntries(summaryText = lastSummary) {
    const resource = currentResource()
    if (!resource.path) return []
    return [
      {
        id: "open-note",
        label: "Open Source Note",
        description: resource.path,
        action: "open-tab",
        path: resource.path,
        targetPath: resource.path,
        targetKind: "workspace",
      },
    ]
  }

  function updateView(summaryText = lastSummary, statusLabel = "Ready", statusTone = "success") {
    const resource = currentResource()
    context.views.updateView("exampleMarkdownExtension.notesView", {
      title: "Note Summary",
      description: currentWorkspace().hasWorkspace
        ? `Workspace notes · launched ${launchCount} times`
        : `Notes tools · launched ${launchCount} times`,
      message: resource.path
        ? `Ready for ${resource.filename || resource.path}`
        : "Open a Markdown note to start summarizing.",
      badgeValue: resource.path ? 1 : 0,
      badgeTooltip: "One note summary action is available.",
      statusLabel,
      statusTone,
      actionLabel: resource.path ? "Run summary or inspect the current note" : "Open a Markdown note first",
      sections: buildSections(summaryText),
      outputs: summaryText
        ? [{
            id: "summary",
            type: "inlineText",
            mediaType: "text/plain",
            title: "Note Summary",
            description: resource.path || "Current note summary",
            text: summaryText,
          }]
        : [],
      resultEntries: buildResultEntries(summaryText),
    })
  }

  treeView.onDidChangeSelection((event) => {
    const selected = Array.isArray(event?.selection) ? event.selection[0] : null
    const label = String(selected?.label || "")
    updateView(label || lastSummary, label ? "Section Selected" : "Ready", label ? "success" : "warning")
  })

  context.capabilities.registerProvider("document.summarize", async (request) => {
    const payload = JSON.parse(String(request?.settingsJson || request?.settings_json || "{}") || "{}")
    const summaryStyle = String(
      payload?.summaryStyle ||
      payload?.["exampleMarkdownExtension.summaryStyle"] ||
      context.settings.get("exampleMarkdownExtension.summaryStyle", "bullet") ||
      "bullet",
    )
    const resource = currentResource()
    const summaryText = [
      `Style: ${summaryStyle}`,
      `File: ${resource.filename || resource.path || "No active note"}`,
      `Workspace: ${currentWorkspace().rootPath || "None"}`,
    ].join("\n")
    lastSummary = summaryText
    updateView(summaryText, "Summary Ready", "success")
    context.views.refresh("exampleMarkdownExtension.notesView")
    return {
      message: `example-markdown-extension summarized ${resource.path || "current note"}`,
      progressLabel: "Note summary completed",
      taskState: "succeeded",
      outputs: [
        {
          id: "summary",
          type: "inlineText",
          mediaType: "text/plain",
          title: "Note Summary",
          description: resource.path || "Current note summary",
          text: summaryText,
        },
      ],
    }
  })

  context.commands.registerCommand("scribeflow.markdown.summarize", async () => {
    const result = await context.capabilities.invoke("document.summarize", {
      summaryStyle: context.settings.get("exampleMarkdownExtension.summaryStyle", "bullet"),
    })
    return result
  }, {
    title: "Summarize Note",
    category: "Notes",
    when: "resourceExtname == .md || resource.kind == workspace",
  })

  context.commands.registerCommand("exampleMarkdownExtension.refreshNotesView", async () => {
    updateView(lastSummary, currentResource().path ? "Ready" : "Waiting", currentResource().path ? "success" : "warning")
    treeView.reveal("notes-summary", {
      focus: true,
      select: true,
      expand: true,
    })
    return {
      message: "example-markdown-extension refreshed notes view",
      progressLabel: "Notes view refreshed",
    }
  }, {
    title: "Refresh Notes View",
    category: "Notes",
  })

  updateView("", currentResource().path ? "Ready" : "Waiting", currentResource().path ? "success" : "warning")
}

export async function deactivate() {}
