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
    return {
      title: "Translate PDF",
      items: [
        {
          id: "translate-current-pdf",
          label,
          description: "Run the PDF translation command for the current target.",
          commandId: "scribeflow.pdf.translate",
        },
      ],
    }
  })
}

export async function deactivate() {}
