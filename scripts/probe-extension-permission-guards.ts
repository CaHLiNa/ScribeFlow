import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const hostPath = path.join(repoRoot, "src-tauri/resources/extension-host/extension-host.mjs");
const extensionPath = path.join(repoRoot, ".scribeflow/extensions/example-pdf-extension");
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

function createProbeChild() {
  const child = spawn("node", [hostPath], {
    cwd: repoRoot,
    stdio: ["pipe", "pipe", "inherit"],
  });

  const observed = [];
  let currentResolve = null;
  let buffer = "";

  function send(method, params) {
    child.stdin.write(`${JSON.stringify({ method, params })}\n`);
  }

  function isTerminal(message) {
    return ["Activate", "ExecuteCommand", "Error"].includes(message.kind);
  }

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) {
        const message = JSON.parse(line);
        observed.push(message);
        if (isTerminal(message) && currentResolve) {
          const { resolve } = currentResolve;
          currentResolve = null;
          resolve(message);
        }
      }
      newlineIndex = buffer.indexOf("\n");
    }
  });

  child.on("exit", (code) => {
    if (currentResolve) {
      const { resolve } = currentResolve;
      currentResolve = null;
      resolve({
        kind: "Error",
        payload: { message: `extension host exited early with code ${code ?? "unknown"}` },
      });
    }
  });

  async function call(method, params) {
    if (currentResolve) {
      throw new Error("probe does not support concurrent calls");
    }
    send(method, params);
    return await new Promise((resolve) => {
      currentResolve = { resolve };
    });
  }

  return {
    child,
    observed,
    call,
    close() {
      child.kill();
    },
  };
}

async function runDeniedScenario({
  extensionId,
  activationEvent,
  commandId,
  permissions,
  capabilities,
  expectedError,
  forbiddenHostCalls = [],
}) {
  const probe = createProbeChild();
  try {
    const activationState = {
      settings: { "examplePdfExtension.targetLang": "zh-CN" },
      globalState: {},
      workspaceState: {},
    };
    const envelope = {
      taskId: `task:${extensionId}`,
      extensionId,
      workspaceRoot: "/tmp/workspace",
      itemId: "",
      itemHandle: "",
      referenceId: "ref-123",
      capability: "",
      targetKind: "referencePdf",
      targetPath: "/tmp/paper.pdf",
      commandId,
      settingsJson: JSON.stringify({ "examplePdfExtension.targetLang": "zh-CN" }),
    };

    const activate = await probe.call("Activate", {
      extensionId,
      workspaceRoot: "/tmp/workspace",
      activationEvent,
      extensionPath,
      manifestPath,
      mainEntry: "./dist/extension.js",
      permissions,
      capabilities,
      activationState,
    });
    assert.equal(activate.kind, "Activate");

    const result = await probe.call("ExecuteCommand", {
      activationEvent,
      extensionId,
      extensionPath,
      manifestPath,
      mainEntry: "./dist/extension.js",
      commandId,
      envelope,
    });

    assert.equal(result.kind, "Error");
    assert.match(String(result.payload?.message || ""), expectedError);

    const hostCallKinds = probe.observed
      .filter((message) => message.kind === "HostCallRequested")
      .map((message) => String(message.payload?.kind || ""));
    for (const kind of forbiddenHostCalls) {
      assert.equal(hostCallKinds.includes(kind), false, `unexpected host call: ${kind}`);
    }

    return {
      extensionId,
      commandId,
      error: String(result.payload?.message || ""),
      hostCallKinds,
    };
  } finally {
    probe.close();
  }
}

async function main() {
  const { permissions: manifestPermissions, capabilities: manifestCapabilities } = await readManifestMetadata();

  const scenarios = await Promise.all([
    runDeniedScenario({
      extensionId: "example-pdf-extension-process-guard",
      activationEvent: "onCommand:examplePdfExtension.inspectProcessApi",
      commandId: "examplePdfExtension.inspectProcessApi",
      permissions: {
        ...manifestPermissions,
        spawnProcess: false,
      },
      capabilities: manifestCapabilities,
      expectedError: /not allowed to spawn local processes/i,
      forbiddenHostCalls: ["process.spawn", "process.wait"],
    }),
    runDeniedScenario({
      extensionId: "example-pdf-extension-reference-guard",
      activationEvent: "onCommand:examplePdfExtension.inspectRuntimeApis",
      commandId: "examplePdfExtension.inspectRuntimeApis",
      permissions: {
        ...manifestPermissions,
        readReferenceLibrary: false,
      },
      capabilities: manifestCapabilities,
      expectedError: /not allowed to read the reference library/i,
      forbiddenHostCalls: ["references.readCurrentLibrary", "pdf.extractMetadata"],
    }),
    runDeniedScenario({
      extensionId: "example-pdf-extension-pdf-guard",
      activationEvent: "onCommand:examplePdfExtension.inspectPdfApi",
      commandId: "examplePdfExtension.inspectPdfApi",
      permissions: {
        ...manifestPermissions,
        readWorkspaceFiles: false,
        readReferenceLibrary: false,
      },
      capabilities: manifestCapabilities,
      expectedError: /not allowed to inspect PDF content/i,
      forbiddenHostCalls: ["pdf.extractMetadata"],
    }),
  ]);

  console.log(JSON.stringify({
    ok: true,
    scenarios,
  }, null, 2));
}

void main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error?.message || String(error),
  }, null, 2));
  process.exitCode = 1;
});
