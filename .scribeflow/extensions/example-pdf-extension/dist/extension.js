export async function activate(context) {
  context.capabilities.registerProvider("pdf.translate", async (request) => {
    const payload = JSON.parse(String(request?.settingsJson || request?.settings_json || "{}") || "{}")
    const targetLang = String(payload?.["examplePdfExtension.targetLang"] || payload?.targetLang || "zh-CN")
    return {
      message: `example-pdf-extension handled ${request?.capability || "unknown"} for ${targetLang}`,
      progressLabel: "Example extension provider executed",
    }
  })

  context.commands.registerCommand("scribeflow.pdf.translate", async (payload) => {
    return await context.capabilities.invoke("pdf.translate", {
      ...payload,
      capability: "pdf.translate",
    })
  })

  context.views.registerViewProvider("examplePdfExtension.translateView", async (payload) => {
    const targetPath = String(payload?.targetPath || "")
    const label = targetPath ? targetPath.split(/[\\/]/).pop() : "Current PDF"
    const expanded = Boolean(context.workspaceState.get("examplePdfExtension.translateView.expanded"))
    return {
      title: "Translate PDF",
      items: [
        {
          id: "translate-group",
          label: "Translation Actions",
          description: expanded ? "Expanded" : "Collapsed",
          commandId: "examplePdfExtension.toggleTranslateGroup",
          collapsibleState: expanded ? "expanded" : "collapsed",
          children: expanded
            ? [
                {
                  id: "translate-current-pdf",
                  label,
                  description: "Run the PDF translation command for the current target.",
                  commandId: "scribeflow.pdf.translate",
                },
              ]
            : [],
        },
      ],
    }
  })

  context.commands.registerCommand("examplePdfExtension.toggleTranslateGroup", async () => {
    const expanded = Boolean(context.workspaceState.get("examplePdfExtension.translateView.expanded"))
    context.workspaceState.update("examplePdfExtension.translateView.expanded", !expanded)
    return {
      message: "example-pdf-extension toggled sidebar group",
      progressLabel: "Example view state updated",
    }
  })
}

export async function deactivate() {}
