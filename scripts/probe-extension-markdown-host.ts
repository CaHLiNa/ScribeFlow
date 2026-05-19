import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const hostPath = path.join(repoRoot, "src-tauri/resources/extension-host/extension-host.mjs");
const extensionPath = path.join(repoRoot, ".scribeflow/extensions/example-markdown-extension");
const manifestPath = path.join(extensionPath, "package.json");

async function readManifestMetadata() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  return {
    permissions:
      manifest && typeof manifest.permissions === "object" && !Array.isArray(manifest.permissions)
        ? manifest.permissions
        : {},
    capabilities: Array.isArray(manifest?.contributes?.capabilities)
      ? manifest.contributes.capabilities
      : [],
  };
}

const child = spawn("node", [hostPath], {
  cwd: repoRoot,
  stdio: ["pipe", "pipe", "inherit"],
});

const observed = [];
let currentResolve = null;

function ensure(condition, message, details = null) {
  if (condition) return;
  const error = new Error(message);
  error.details = details;
  throw error;
}

function send(method, params) {
  child.stdin.write(`${JSON.stringify({ method, params })}\n`);
}

function isTerminal(message) {
  return ["Activate", "InvokeCapability", "ExecuteCommand", "ResolveView", "Error"].includes(message.kind);
}

function call(method, params) {
  if (currentResolve) {
    throw new Error("probe does not support concurrent calls");
  }
  send(method, params);
  return new Promise((resolve, reject) => {
    currentResolve = { resolve, reject };
  });
}

child.stdout.setEncoding("utf8");
let buffer = "";
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  let newlineIndex = buffer.indexOf("\n");
  while (newlineIndex >= 0) {
    const line = buffer.slice(0, newlineIndex).trim();
    buffer = buffer.slice(newlineIndex + 1);
    if (line) {
      const message = JSON.parse(line);
      observed.push(message);
      if (isTerminal(message)) {
        if (!currentResolve) {
          throw new Error(`unexpected terminal message without waiter: ${message.kind}`);
        }
        const { resolve, reject } = currentResolve;
        currentResolve = null;
        if (message.kind === "Error") {
          reject(new Error(String(message.payload?.message || "Unknown extension host error")));
        } else {
          resolve(message);
        }
      }
    }
    newlineIndex = buffer.indexOf("\n");
  }
});

child.on("exit", (code) => {
  if (currentResolve) {
    const { reject } = currentResolve;
    currentResolve = null;
    reject(new Error(`extension host exited early with code ${code ?? "unknown"}`));
  }
});

setTimeout(() => {
  if (!currentResolve) return;
  console.error(JSON.stringify({ timeout: true, observed }, null, 2));
  process.exitCode = 1;
  child.kill();
}, 8000);

async function main() {
  const { permissions, capabilities } = await readManifestMetadata();
  const activationState = {
    settings: { "exampleMarkdownExtension.summaryStyle": "bullet" },
    globalState: {},
    workspaceState: {},
  };
  const baseEnvelope = {
    taskId: "task-markdown",
    extensionId: "example-markdown-extension",
    workspaceRoot: "/tmp/workspace",
    itemId: "",
    itemHandle: "",
    referenceId: "",
    capability: "",
    targetKind: "workspace",
    targetPath: "/tmp/notes/draft.md",
  };

  const activate = await call("Activate", {
    extensionId: "example-markdown-extension",
    workspaceRoot: "/tmp/workspace",
    activationEvent: "onCommand:scribeflow.markdown.summarize",
    extensionPath,
    manifestPath,
    mainEntry: "./dist/extension.js",
    permissions,
    capabilities,
    activationState,
  });

  const capability = await call("InvokeCapability", {
    activationEvent: "onCapability:document.summarize",
    extensionPath,
    manifestPath,
    mainEntry: "./dist/extension.js",
    envelope: {
      ...baseEnvelope,
      capability: "document.summarize",
      settingsJson: JSON.stringify({ "exampleMarkdownExtension.summaryStyle": "bullet" }),
    },
  });

  const command = await call("ExecuteCommand", {
    activationEvent: "onCommand:scribeflow.markdown.summarize",
    extensionPath,
    manifestPath,
    mainEntry: "./dist/extension.js",
    commandId: "scribeflow.markdown.summarize",
    envelope: {
      ...baseEnvelope,
      commandId: "scribeflow.markdown.summarize",
      settingsJson: JSON.stringify({ "exampleMarkdownExtension.summaryStyle": "bullet" }),
    },
  });

  const resolved = await call("ResolveView", {
    activationEvent: "onView:exampleMarkdownExtension.notesView",
    extensionPath,
    manifestPath,
    mainEntry: "./dist/extension.js",
    viewId: "exampleMarkdownExtension.notesView",
    parentItemId: "",
    envelope: {
      ...baseEnvelope,
      settingsJson: JSON.stringify({ "exampleMarkdownExtension.summaryStyle": "bullet" }),
    },
  });

  const runtimeCommands = activate?.payload?.registeredCommands || [];
  const runtimeCapabilities = activate?.payload?.registeredCapabilities || [];
  const runtimeViews = activate?.payload?.registeredViews || [];

  ensure(runtimeCommands.includes("scribeflow.markdown.summarize"), "markdown command was not registered", {
    runtimeCommands,
  });
  ensure(runtimeCapabilities.includes("document.summarize"), "markdown capability was not registered", {
    runtimeCapabilities,
  });
  ensure(runtimeViews.includes("exampleMarkdownExtension.notesView"), "markdown view was not registered", {
    runtimeViews,
  });
  ensure(capability?.payload?.accepted === true, "markdown capability invocation was not accepted", capability?.payload || {});
  ensure(Array.isArray(capability?.payload?.outputs) && capability.payload.outputs.length > 0, "markdown capability did not emit structured outputs", capability?.payload || {});
  ensure(String(capability?.payload?.outputs?.[0]?.type || '').toLowerCase() === 'inlinetext', "markdown capability output type drifted", capability?.payload || {});
  ensure(command?.payload?.accepted === true, "markdown command execution was not accepted", command?.payload || {});
  ensure(String(command?.payload?.message || "").includes("summarized"), "markdown command did not run through capability provider", command?.payload || {});
  ensure(Array.isArray(resolved?.payload?.sections) && resolved.payload.sections.length > 0, "markdown view did not emit sidebar sections", resolved?.payload || {});
  ensure(Array.isArray(resolved?.payload?.resultEntries) && resolved.payload.resultEntries.length > 0, "markdown view did not emit result entries", resolved?.payload || {});
  ensure(Array.isArray(resolved?.payload?.outputs) && resolved.payload.outputs.length > 0, "markdown view did not emit structured outputs", resolved?.payload || {});
  ensure(String(resolved?.payload?.outputs?.[0]?.type || '').toLowerCase() === 'inlinetext', "markdown view output type drifted", resolved?.payload || {});

  console.log(JSON.stringify({
    ok: true,
    summary: {
      runtimeCommands,
      runtimeCapabilities,
      runtimeViews,
      outputTypes: Array.isArray(capability?.payload?.outputs)
        ? capability.payload.outputs.map((entry) => entry.type)
        : [],
      viewOutputTypes: Array.isArray(resolved?.payload?.outputs)
        ? resolved.payload.outputs.map((entry) => entry.type)
        : [],
      commandMessage: command?.payload?.message || "",
      resultEntryIds: Array.isArray(resolved?.payload?.resultEntries)
        ? resolved.payload.resultEntries.map((entry) => entry.id)
        : [],
    },
  }, null, 2));
  child.kill();
}

void main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error?.message || String(error),
    details: error?.details || null,
  }, null, 2));
  process.exitCode = 1;
  child.kill();
});
