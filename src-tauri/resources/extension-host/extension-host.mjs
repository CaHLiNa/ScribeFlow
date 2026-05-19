import path from "node:path";
import readline from "node:readline";
import { pathToFileURL } from "node:url";
import fs from "node:fs";
const extensions = new Map();
const pendingUiRequests = new Map();
const pendingHostCalls = new Map();
let menuActionCounter = 0;
function normalizeExtensionId(value = "") {
    return String(value || "").trim().toLowerCase();
}
function normalizeWorkspaceRoot(value = "") {
    return String(value || "").trim();
}
function extensionRuntimeKey(extensionId = "", workspaceRoot = "") {
    return `${normalizeExtensionId(extensionId)}::${normalizeWorkspaceRoot(workspaceRoot)}`;
}
function requestWorkspaceRoot(request = {}) {
    return normalizeWorkspaceRoot(request.workspaceRoot ||
        request.envelope?.workspaceRoot ||
        request.currentWorkspaceRoot ||
        "");
}
function requestRuntimeKey(request = {}) {
    return extensionRuntimeKey(request.extensionId || request.envelope?.extensionId || "", requestWorkspaceRoot(request));
}
function normalizeLocale(value = "") {
    return String(value || "").trim().toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
}
function readJsonFile(filePath = "") {
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
    }
    catch {
        return {};
    }
}
function loadExtensionMessages(extensionPath = "", locale = "") {
    const normalizedLocale = normalizeLocale(locale);
    const messages = {
        ...readJsonFile(path.join(extensionPath, "package.nls.json")),
        ...readJsonFile(path.join(extensionPath, `package.nls.${normalizedLocale}.json`)),
    };
    return messages && typeof messages === "object" && !Array.isArray(messages) ? messages : {};
}
function interpolate(message = "", vars = {}) {
    return String(message).replace(/\{(\w+)\}/g, (_, key) => vars[key] == null ? "" : String(vars[key]));
}
function createI18nApi(registry) {
    return {
        get locale() {
            return normalizeLocale(registry.locale || "");
        },
        t(key = "", vars = {}) {
            const normalizedKey = String(key || "");
            const message = registry.messages?.[normalizedKey] || normalizedKey;
            return interpolate(message, vars);
        },
    };
}
function normalizeCapabilityExtensions(values = []) {
    return Array.isArray(values)
        ? values
            .map((value) => String(value || "").trim().toLowerCase())
            .filter(Boolean)
            .map((value) => (value.startsWith(".") ? value : `.${value.replace(/^\.+/, "")}`))
        : [];
}
function validateCapabilityInputDefinition(key = "", definition = {}, target = {}) {
    const inputType = String(definition?.type || definition?.inputType || "").trim().toLowerCase();
    const targetPath = String(target?.path || "").trim();
    const referenceId = String(target?.referenceId || "").trim();
    const targetExtension = targetPath ? path.extname(targetPath).toLowerCase() : "";
    if (inputType === "workspacefile" || inputType === "artifact") {
        if (!targetPath) {
            throw new Error(`Capability input \`${key}\` is not satisfied: Requires an active file target`);
        }
        const allowedExtensions = normalizeCapabilityExtensions(definition?.extensions);
        if (allowedExtensions.length > 0 && !allowedExtensions.includes(targetExtension)) {
            throw new Error(`Capability input \`${key}\` is not satisfied: Requires one of: ${allowedExtensions.join(", ")}`);
        }
        return;
    }
    if (inputType === "reference") {
        if (!referenceId) {
            throw new Error(`Capability input \`${key}\` is not satisfied: Requires a selected reference`);
        }
        return;
    }
    if (!targetPath && !referenceId) {
        throw new Error(`Capability input \`${key}\` is not satisfied: Missing required capability input`);
    }
}
function validateCapabilityInputs(contract = {}, target = {}) {
    const inputs = contract?.inputs && typeof contract.inputs === "object" ? contract.inputs : {};
    for (const [key, definition] of Object.entries(inputs)) {
        if (definition?.required === true) {
            validateCapabilityInputDefinition(key, definition, target);
        }
    }
}
function writeMessage(message) {
    process.stdout.write(JSON.stringify(message) + "\n");
}
function findRegisteredCommand(registry, commandId = "") {
    const normalized = String(commandId || "").trim();
    if (!normalized)
        return null;
    return registry?.commands?.get(normalized) || null;
}
function emitWindowMessage(registry, severity = "info", message = "") {
    const normalizedMessage = String(message || "").trim();
    if (!normalizedMessage)
        return;
    writeMessage({
        kind: "WindowMessage",
        payload: {
            extensionId: registry.id,
            workspaceRoot: String(registry.currentWorkspaceRoot || ""),
            severity: String(severity || "info"),
            message: normalizedMessage,
        },
    });
}
let uiRequestCounter = 0;
let hostCallCounter = 0;
function nextUiRequestId(registry) {
    uiRequestCounter += 1;
    return `${registry.id}:ui:${uiRequestCounter}`;
}
function requestUiInput(registry, kind = "", payload = {}) {
    const requestId = nextUiRequestId(registry);
    writeMessage({
        kind: "WindowInputRequested",
        payload: {
            requestId,
            extensionId: registry.id,
            workspaceRoot: String(registry.currentWorkspaceRoot || ""),
            kind: String(kind || "").trim(),
            ...payload,
        },
    });
    return new Promise((resolve, reject) => {
        pendingUiRequests.set(requestId, { resolve, reject });
    });
}
function nextHostCallRequestId(registry) {
    hostCallCounter += 1;
    return `${registry.id}:host:${hostCallCounter}`;
}
function requestHostCall(registry, kind = "", payload = {}) {
    const requestId = nextHostCallRequestId(registry);
    const invocation = registry.lastInvocation || createInvocationContext(registry);
    writeMessage({
        kind: "HostCallRequested",
        payload: {
            requestId,
            extensionId: registry.id,
            workspaceRoot: String(registry.currentWorkspaceRoot || ""),
            kind: String(kind || "").trim(),
            payload: {
                taskId: String(invocation?.taskId || "").trim(),
                ...payload,
            },
        },
    });
    return new Promise((resolve, reject) => {
        pendingHostCalls.set(requestId, { resolve, reject });
    });
}
function emitStateChanged(registry) {
    writeMessage({
        kind: "StateChanged",
        payload: {
            extensionId: registry.id,
            workspaceRoot: String(registry.currentWorkspaceRoot || ""),
            globalState: Object.fromEntries(registry.globalState.entries()),
            workspaceState: Object.fromEntries(registry.workspaceState.entries()),
        },
    });
}
function resolveTreeItemHandle(registry, viewId = "", itemOrHandle) {
    const id = String(viewId || "").trim();
    if (!id)
        return "";
    if (typeof itemOrHandle === "string") {
        return itemOrHandle.trim();
    }
    if (itemOrHandle && typeof itemOrHandle === "object") {
        const directHandle = String(itemOrHandle.handle || itemOrHandle.id || "").trim();
        if (directHandle)
            return directHandle;
    }
    const treeItems = registry.treeItems.get(id);
    if (!treeItems)
        return "";
    for (const [handle, element] of treeItems.entries()) {
        if (element === itemOrHandle) {
            return String(handle || "").trim();
        }
    }
    return "";
}
function collectTreeParentHandles(registry, viewId = "", itemHandle = "") {
    const parents = [];
    const treeParents = registry.treeParents.get(String(viewId || "").trim());
    if (!treeParents)
        return parents;
    let current = String(itemHandle || "").trim();
    const seen = new Set();
    while (current) {
        const parentHandle = String(treeParents.get(current) || "").trim();
        if (!parentHandle || seen.has(parentHandle))
            break;
        parents.unshift(parentHandle);
        seen.add(parentHandle);
        current = parentHandle;
    }
    return parents;
}
function createEmitter() {
    const listeners = new Set();
    return {
        event(listener) {
            if (typeof listener !== "function") {
                return { dispose() { } };
            }
            listeners.add(listener);
            return {
                dispose() {
                    listeners.delete(listener);
                },
            };
        },
        fire(payload) {
            for (const listener of [...listeners]) {
                listener(payload);
            }
        },
    };
}
function normalizeSettingsObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {};
    }
    return value;
}
function canReadPdfContent(registry) {
    return Boolean(registry.permissions?.readWorkspaceFiles ||
        registry.permissions?.readReferenceLibrary);
}
function normalizeArtifactEntries(entries = [], envelope = {}, options = {}) {
    const fallbackTaskId = String(envelope?.taskId || "").trim();
    const fallbackExtensionId = String(envelope?.extensionId || "").trim();
    const fallbackCapability = String(envelope?.capability || envelope?.commandId || "").trim();
    const fallbackSourcePath = String(envelope?.targetPath || "").trim();
    const createdAt = new Date().toISOString();
    const preferExplicitMetadata = options?.preferExplicitMetadata === true;
    if (!Array.isArray(entries))
        return [];
    return entries
        .map((entry, index) => {
        if (!entry || typeof entry !== "object")
            return null;
        const artifactPath = String(entry.path || entry.filePath || "").trim();
        if (!artifactPath)
            return null;
        return {
            id: String(entry.id || `artifact:${index + 1}`).trim(),
            extensionId: preferExplicitMetadata
                ? String(entry.extensionId || entry.extension_id || fallbackExtensionId).trim()
                : String(fallbackExtensionId || entry.extensionId || entry.extension_id || "").trim(),
            taskId: preferExplicitMetadata
                ? String(entry.taskId || entry.task_id || fallbackTaskId).trim()
                : String(fallbackTaskId || entry.taskId || entry.task_id || "").trim(),
            capability: preferExplicitMetadata
                ? String(entry.capability || fallbackCapability).trim()
                : String(fallbackCapability || entry.capability || "").trim(),
            kind: String(entry.kind || "").trim(),
            mediaType: String(entry.mediaType || entry.media_type || "").trim(),
            path: artifactPath,
            sourcePath: String(entry.sourcePath || entry.source_path || fallbackSourcePath).trim(),
            sourceHash: String(entry.sourceHash || entry.source_hash || "").trim(),
            createdAt: String(entry.createdAt || entry.created_at || createdAt).trim(),
        };
    })
        .filter(Boolean);
}
function cloneArtifactEntries(entries = []) {
    if (!Array.isArray(entries))
        return [];
    return entries
        .map((entry, index) => {
        if (!entry || typeof entry !== "object")
            return null;
        const artifactPath = String(entry.path || entry.filePath || "").trim();
        if (!artifactPath)
            return null;
        return {
            id: String(entry.id || `artifact:${index + 1}`).trim(),
            extensionId: String(entry.extensionId || entry.extension_id || "").trim(),
            taskId: String(entry.taskId || entry.task_id || "").trim(),
            capability: String(entry.capability || "").trim(),
            kind: String(entry.kind || "").trim(),
            mediaType: String(entry.mediaType || entry.media_type || "").trim(),
            path: artifactPath,
            sourcePath: String(entry.sourcePath || entry.source_path || "").trim(),
            sourceHash: String(entry.sourceHash || entry.source_hash || "").trim(),
            createdAt: String(entry.createdAt || entry.created_at || "").trim(),
        };
    })
        .filter(Boolean);
}
function normalizeOutputEntries(entries = []) {
    if (!Array.isArray(entries))
        return [];
    return entries
        .map((entry, index) => {
        if (!entry || typeof entry !== "object")
            return null;
        const text = String(entry.text || "").trim();
        const html = String(entry.html || "").trim();
        const outputType = String(entry.type || entry.outputType || entry.output_type || "").trim();
        const mediaType = String(entry.mediaType || entry.media_type || "").trim();
        if (!text && !html && !outputType && !mediaType)
            return null;
        return {
            id: String(entry.id || `output:${index + 1}`).trim(),
            type: outputType,
            mediaType,
            title: String(entry.title || "").trim(),
            description: String(entry.description || "").trim(),
            text,
            html,
        };
    })
        .filter(Boolean);
}
function normalizeTaskState(value = "", fallback = "succeeded") {
    const normalized = String(value || "").trim().toLowerCase();
    if (["queued", "running", "succeeded", "failed", "cancelled"].includes(normalized)) {
        return normalized;
    }
    return fallback;
}
function normalizeCommandMetadata(command = "", metadata = {}) {
    const commandId = String(command || "").trim();
    if (!commandId)
        return null;
    return {
        commandId,
        title: String(metadata?.title || commandId).trim(),
        category: String(metadata?.category || "").trim(),
        when: String(metadata?.when || "").trim(),
    };
}
function normalizeViewMetadata(viewId = "", metadata = {}) {
    const id = String(viewId || "").trim();
    if (!id)
        return null;
    return {
        id,
        title: String(metadata?.title || id).trim(),
        when: String(metadata?.when || "").trim(),
    };
}
function normalizeSidebarSections(entries = []) {
    if (!Array.isArray(entries))
        return [];
    return entries
        .map((entry, index) => {
        if (!entry || typeof entry !== "object")
            return null;
        return {
            id: String(entry.id || `section:${index}`).trim(),
            kind: String(entry.kind || "").trim(),
            title: String(entry.title || "").trim(),
            value: String(entry.value || "").trim(),
            tone: String(entry.tone || "").trim(),
        };
    })
        .filter((entry) => entry && (entry.title || entry.value));
}
function normalizeResultEntries(entries = [], extensionId = "") {
    const normalizedExtensionId = String(extensionId || "").trim();
    if (!Array.isArray(entries))
        return [];
    return entries
        .map((entry, index) => {
        if (!entry || typeof entry !== "object")
            return null;
        return {
            id: String(entry.id || `result:${index}`).trim(),
            label: String(entry.label || entry.title || "").trim(),
            description: String(entry.description || "").trim(),
            path: String(entry.path || "").trim(),
            action: String(entry.action || "").trim(),
            commandId: String(entry.commandId || entry.command_id || "").trim(),
            targetPath: String(entry.targetPath || entry.target_path || "").trim(),
            referenceId: String(entry.referenceId || entry.reference_id || "").trim(),
            targetKind: String(entry.targetKind || entry.target_kind || "").trim(),
            extensionId: String(entry.extensionId || entry.extension_id || "").trim() || normalizedExtensionId,
            payload: entry.payload && typeof entry.payload === "object" && !Array.isArray(entry.payload)
                ? entry.payload
                : {},
            previewMode: String(entry.previewMode || entry.preview_mode || "").trim(),
            previewPath: String(entry.previewPath || entry.preview_path || "").trim(),
            previewTitle: String(entry.previewTitle || entry.preview_title || "").trim(),
            mediaType: String(entry.mediaType || entry.media_type || "").trim(),
        };
    })
        .filter((entry) => entry && entry.label);
}
function normalizeViewPresentation(entry = {}) {
    const source = entry && typeof entry === "object" && !Array.isArray(entry) ? entry : {};
    const target = source.target && typeof source.target === "object" && !Array.isArray(source.target)
        ? source.target
        : {};
    const action = source.action && typeof source.action === "object" && !Array.isArray(source.action)
        ? source.action
        : {};
    const progress = source.progress && typeof source.progress === "object" && !Array.isArray(source.progress)
        ? source.progress
        : {};
    return {
        mode: String(source.mode || "").trim(),
        target: {
            label: String(target.label || "").trim(),
            path: String(target.path || "").trim(),
            emptyLabel: String(target.emptyLabel || "").trim(),
        },
        action: {
            label: String(action.label || "").trim(),
            commandId: String(action.commandId || action.command || "").trim(),
            disabled: Boolean(action.disabled),
        },
        progress: {
            label: String(progress.label || "").trim(),
            state: String(progress.state || "").trim(),
            current: Number.isFinite(Number(progress.current)) ? Number(progress.current) : 0,
            total: Number.isFinite(Number(progress.total)) ? Number(progress.total) : 0,
        },
    };
}
function normalizeMenuActionMetadata(command = "", metadata = {}) {
    const commandId = String(command || "").trim();
    const surface = String(metadata?.surface || "").trim();
    if (!commandId || !surface)
        return null;
    return {
        commandId,
        surface,
        title: String(metadata?.title || commandId).trim(),
        category: String(metadata?.category || "").trim(),
        when: String(metadata?.when || "").trim(),
        group: String(metadata?.group || "").trim(),
    };
}
function buildResourceContext(envelope = {}) {
    const targetPath = String(envelope?.targetPath || "").trim();
    const targetKind = String(envelope?.targetKind || "").trim();
    const extension = path.extname(targetPath).toLowerCase();
    const basename = targetPath ? path.basename(targetPath) : "";
    const dirname = targetPath ? path.dirname(targetPath) : "";
    let languageId = "";
    if (extension === ".pdf")
        languageId = "pdf";
    else if (extension === ".md" || extension === ".markdown")
        languageId = "markdown";
    else if (extension === ".tex" || extension === ".latex")
        languageId = "latex";
    else if (extension === ".py")
        languageId = "python";
    else if (extension === ".bib")
        languageId = "bibtex";
    else if (extension === ".json")
        languageId = "json";
    else if (extension === ".csv")
        languageId = "csv";
    else if (extension === ".txt")
        languageId = "plaintext";
    else if (extension)
        languageId = extension.slice(1);
    let resourceKind = targetKind;
    if (!resourceKind) {
        if (extension === ".pdf")
            resourceKind = "pdf";
        else if (languageId)
            resourceKind = languageId;
        else if (targetPath)
            resourceKind = "file";
    }
    return {
        kind: resourceKind,
        targetKind,
        path: targetPath,
        extname: extension,
        filename: basename,
        dirname: dirname && dirname !== "." ? dirname : "",
        langId: languageId,
        isPdf: resourceKind === "pdf",
        isMarkdown: languageId === "markdown",
        isLatex: languageId === "latex",
        isPython: languageId === "python",
    };
}
function createInvocationContext(registry, envelope = {}) {
    const workspaceRoot = String(envelope?.workspaceRoot || registry.currentWorkspaceRoot || "").trim();
    const resource = buildResourceContext(envelope);
    const target = {
        kind: String(envelope?.targetKind || "").trim(),
        referenceId: String(envelope?.referenceId || "").trim(),
        path: String(envelope?.targetPath || "").trim(),
    };
    return {
        extensionId: registry.id,
        workspaceRoot,
        taskId: String(envelope?.taskId || "").trim(),
        commandId: String(envelope?.commandId || "").trim(),
        capability: String(envelope?.capability || "").trim(),
        itemId: String(envelope?.itemId || "").trim(),
        itemHandle: String(envelope?.itemHandle || "").trim(),
        referenceId: String(envelope?.referenceId || "").trim(),
        target,
        resource,
        settingsJson: String(envelope?.settingsJson || "{}"),
        locale: normalizeLocale(envelope?.locale || registry.locale || ""),
    };
}
function setInvocationContext(registry, envelope = {}) {
    registry.currentWorkspaceRoot = String(envelope?.workspaceRoot || "").trim();
    if (envelope?.locale) {
        registry.locale = normalizeLocale(envelope.locale);
    }
    registry.lastInvocation = createInvocationContext(registry, envelope);
}
function emitSettingsChanged(registry, changedKeys = []) {
    const normalizedKeys = Array.isArray(changedKeys)
        ? changedKeys.map((key) => String(key || "").trim()).filter(Boolean)
        : [];
    registry.settingsEmitter.fire({
        keys: normalizedKeys,
        values: Object.fromEntries(registry.settings.entries()),
    });
}
function createExtensionApi(registry) {
    return {
        commands: {
            registerCommand(command, handler, metadata = {}) {
                const id = String(command || "").trim();
                if (id && typeof handler === "function") {
                    registry.commands.set(id, handler);
                    const normalizedMetadata = normalizeCommandMetadata(id, metadata);
                    if (normalizedMetadata) {
                        registry.commandMetadata.set(id, normalizedMetadata);
                    }
                }
                return {
                    dispose() {
                        registry.commands.delete(id);
                        registry.commandMetadata.delete(id);
                    },
                };
            },
            async executeCommand(command, ...args) {
                const id = String(command || "").trim();
                if (!id) {
                    throw new Error("Command id is required");
                }
                const handler = findRegisteredCommand(registry, id);
                if (!handler) {
                    throw new Error(`Command not registered: ${id}`);
                }
                const beforeChangedViews = new Set(registry.changedViews);
                const result = await handler(...args);
                const nestedChangedViews = collectChangedViews(registry, result?.changedViews);
                for (const entry of beforeChangedViews) {
                    const normalized = String(entry || "").trim();
                    if (normalized) {
                        registry.changedViews.add(normalized);
                    }
                }
                for (const entry of nestedChangedViews) {
                    const normalized = String(entry || "").trim();
                    if (normalized) {
                        registry.changedViews.add(normalized);
                    }
                }
                return {
                    ...(result && typeof result === "object" ? result : {}),
                    changedViews: nestedChangedViews,
                };
            },
        },
        menus: {
            registerAction(command, metadata = {}) {
                const commandId = String(command || "").trim();
                const normalizedMetadata = normalizeMenuActionMetadata(commandId, metadata);
                const registrationId = normalizedMetadata ? `menu:${menuActionCounter += 1}` : "";
                if (normalizedMetadata) {
                    registry.menuActionMetadata.set(registrationId, normalizedMetadata);
                }
                return {
                    dispose() {
                        if (!normalizedMetadata || !registrationId)
                            return;
                        registry.menuActionMetadata.delete(registrationId);
                    },
                };
            },
        },
        capabilities: {
            registerProvider(capability, handler) {
                const id = String(capability || "").trim();
                if (id && typeof handler === "function") {
                    registry.capabilities.set(id, handler);
                }
                return {
                    dispose() {
                        registry.capabilities.delete(id);
                    },
                };
            },
            async invoke(capability, payload) {
                const capabilityId = String(capability || "").trim();
                const provider = registry.capabilities.get(capabilityId);
                if (!provider) {
                    throw new Error(`No capability provider registered for ${capabilityId}`);
                }
                const invocation = registry.lastInvocation || createInvocationContext(registry);
                const mergedTarget = {
                    ...(invocation?.target || { kind: "", referenceId: "", path: "" }),
                    ...(payload && typeof payload === "object" && !Array.isArray(payload)
                        ? {
                            kind: String(payload?.targetKind || payload?.kind || invocation?.target?.kind || "").trim(),
                            referenceId: String(payload?.referenceId || invocation?.target?.referenceId || "").trim(),
                            path: String(payload?.targetPath || payload?.path || invocation?.target?.path || "").trim(),
                        }
                        : {}),
                };
                const contract = registry.capabilityContracts.get(capabilityId);
                if (contract) {
                    validateCapabilityInputs(contract, mergedTarget);
                }
                const beforeChangedViews = new Set(registry.changedViews);
                const result = await provider(payload);
                const nestedChangedViews = collectChangedViews(registry, result?.changedViews);
                for (const entry of beforeChangedViews) {
                    const normalized = String(entry || "").trim();
                    if (normalized) {
                        registry.changedViews.add(normalized);
                    }
                }
                for (const entry of nestedChangedViews) {
                    const normalized = String(entry || "").trim();
                    if (normalized) {
                        registry.changedViews.add(normalized);
                    }
                }
                return {
                    ...(result && typeof result === "object" ? result : {}),
                    changedViews: nestedChangedViews,
                };
            },
        },
        views: {
            registerViewProvider(viewId, provider, metadata = {}) {
                const id = String(viewId || "").trim();
                if (id && typeof provider === "function") {
                    registry.viewProviders.set(id, provider);
                    const normalizedMetadata = normalizeViewMetadata(id, metadata);
                    if (normalizedMetadata) {
                        registry.viewMetadata.set(id, normalizedMetadata);
                    }
                }
                return {
                    dispose() {
                        registry.viewProviders.delete(id);
                        registry.viewMetadata.delete(id);
                        registry.viewState.delete(id);
                        registry.viewStatePatches.delete(id);
                    },
                };
            },
            registerTreeDataProvider(viewId, provider, metadata = {}) {
                const id = String(viewId || "").trim();
                if (id && provider && typeof provider === "object") {
                    registry.treeViews.set(id, provider);
                    const normalizedMetadata = normalizeViewMetadata(id, metadata);
                    if (normalizedMetadata) {
                        registry.viewMetadata.set(id, normalizedMetadata);
                    }
                    if (!registry.treeViewControllers.has(id)) {
                        registry.treeViewControllers.set(id, createTreeViewController(registry, id));
                    }
                    if (!registry.treeItems.has(id)) {
                        registry.treeItems.set(id, new Map());
                    }
                    if (!registry.treeParents.has(id)) {
                        registry.treeParents.set(id, new Map());
                    }
                    if (!registry.viewState.has(id)) {
                        registry.viewState.set(id, createEmptyViewState(id));
                    }
                    if (!registry.viewStatePatches.has(id)) {
                        registry.viewStatePatches.set(id, {});
                    }
                }
                return {
                    dispose() {
                        registry.treeViews.delete(id);
                        registry.viewMetadata.delete(id);
                        registry.treeItems.delete(id);
                        registry.treeParents.delete(id);
                        registry.viewState.delete(id);
                        registry.viewStatePatches.delete(id);
                    },
                };
            },
            createTreeView(viewId) {
                const id = String(viewId || "").trim();
                if (!id) {
                    throw new Error("View id is required");
                }
                let controller = registry.treeViewControllers.get(id);
                if (!controller) {
                    controller = createTreeViewController(registry, id);
                    registry.treeViewControllers.set(id, controller);
                }
                return controller.api;
            },
            updateView(viewId, patch = {}) {
                const id = String(viewId || "").trim();
                if (!id)
                    return;
                const current = registry.viewState.get(id) || createEmptyViewState(id);
                const currentPatch = registry.viewStatePatches.get(id) || {};
                const nextPatch = extractViewStatePatch(currentPatch, patch, registry);
                registry.viewStatePatches.set(id, nextPatch);
                const next = mergeViewStatePatch(current, patch, registry);
                registry.viewState.set(id, next);
                writeMessage({
                    kind: "ViewStateChanged",
                    payload: {
                        extensionId: registry.id,
                        workspaceRoot: String(registry.currentWorkspaceRoot || ""),
                        viewId: id,
                        title: next.title,
                        description: next.description,
                        message: next.message,
                        badgeValue: next.badgeValue,
                        badgeTooltip: next.badgeTooltip,
                        statusLabel: next.statusLabel,
                        statusTone: next.statusTone,
                        actionLabel: next.actionLabel,
                        presentation: next.presentation,
                        sections: next.sections,
                        resultEntries: next.resultEntries,
                        artifacts: next.artifacts,
                        outputs: next.outputs,
                    },
                });
            },
            refresh(viewId) {
                const id = String(viewId || "").trim();
                if (id) {
                    registry.changedViews.add(id);
                    writeMessage({
                        kind: "ViewChanged",
                        payload: {
                            extensionId: registry.id,
                            workspaceRoot: String(registry.currentWorkspaceRoot || ""),
                            viewIds: [id],
                        },
                    });
                }
            },
            reveal(viewId, itemOrHandle, options = {}) {
                const id = String(viewId || "").trim();
                const itemHandle = resolveTreeItemHandle(registry, id, itemOrHandle);
                if (!id || !itemHandle)
                    return;
                writeMessage({
                    kind: "ViewRevealRequested",
                    payload: {
                        extensionId: registry.id,
                        workspaceRoot: String(registry.currentWorkspaceRoot || ""),
                        viewId: id,
                        itemHandle,
                        parentHandles: collectTreeParentHandles(registry, id, itemHandle),
                        focus: Boolean(options?.focus),
                        select: options?.select !== false,
                        expand: options?.expand !== false,
                    },
                });
            },
        },
        workspaceState: {
            get(key) {
                return registry.workspaceState.get(String(key || "").trim());
            },
            update(key, value) {
                registry.workspaceState.set(String(key || "").trim(), value);
                emitStateChanged(registry);
            },
        },
        globalState: {
            get(key) {
                return registry.globalState.get(String(key || "").trim());
            },
            update(key, value) {
                registry.globalState.set(String(key || "").trim(), value);
                emitStateChanged(registry);
            },
        },
        settings: {
            get(key, fallback = undefined) {
                const id = String(key || "").trim();
                if (!id)
                    return fallback;
                return registry.settings.has(id) ? registry.settings.get(id) : fallback;
            },
            onDidChange(listener) {
                return registry.settingsEmitter.event(listener);
            },
        },
        process: {
            async exec(command = "", options = {}) {
                if (!registry.permissions?.spawnProcess) {
                    throw new Error(`Extension ${registry.id} is not allowed to spawn local processes`);
                }
                const normalizedCommand = String(command || "").trim();
                if (!normalizedCommand) {
                    throw new Error("Process command is required");
                }
                const result = await requestHostCall(registry, "process.exec", {
                    command: normalizedCommand,
                    args: Array.isArray(options?.args)
                        ? options.args.map((value) => String(value ?? ""))
                        : [],
                    cwd: String(options?.cwd || registry.currentWorkspaceRoot || ""),
                    env: normalizeSettingsObject(options?.env),
                });
                return result && typeof result === "object" ? result : {};
            },
            async wait(pid) {
                if (!registry.permissions?.spawnProcess) {
                    throw new Error(`Extension ${registry.id} is not allowed to spawn local processes`);
                }
                const normalizedPid = Number.parseInt(String(pid ?? "").trim(), 10);
                if (!Number.isFinite(normalizedPid) || normalizedPid <= 0) {
                    throw new Error("Process pid is required");
                }
                const result = await requestHostCall(registry, "process.wait", {
                    pid: normalizedPid,
                });
                return result && typeof result === "object" ? result : {};
            },
            async spawn(command = "", options = {}) {
                if (!registry.permissions?.spawnProcess) {
                    throw new Error(`Extension ${registry.id} is not allowed to spawn local processes`);
                }
                const normalizedCommand = String(command || "").trim();
                if (!normalizedCommand) {
                    throw new Error("Process command is required");
                }
                const result = await requestHostCall(registry, "process.spawn", {
                    command: normalizedCommand,
                    args: Array.isArray(options?.args)
                        ? options.args.map((value) => String(value ?? ""))
                        : [],
                    cwd: String(options?.cwd || registry.currentWorkspaceRoot || ""),
                    env: normalizeSettingsObject(options?.env),
                });
                const normalizedResult = result && typeof result === "object" ? result : {};
                return {
                    ...normalizedResult,
                    async wait() {
                        const pid = Number.parseInt(String(normalizedResult?.pid ?? "").trim(), 10);
                        if (!Number.isFinite(pid) || pid <= 0) {
                            throw new Error("Spawned process pid is required");
                        }
                        const waited = await requestHostCall(registry, "process.wait", {
                            pid,
                        });
                        return waited && typeof waited === "object" ? waited : {};
                    },
                };
            },
        },
        tasks: {
            get current() {
                return {
                    id: String(registry.lastInvocation?.taskId || "").trim(),
                    commandId: String(registry.lastInvocation?.commandId || "").trim(),
                    capability: String(registry.lastInvocation?.capability || "").trim(),
                };
            },
            async update(patch = {}) {
                const result = await requestHostCall(registry, "tasks.update", normalizeTaskPatch(patch));
                return result && typeof result === "object" ? result : {};
            },
        },
        workspace: {
            get rootPath() {
                return String(registry.lastInvocation?.workspaceRoot || registry.currentWorkspaceRoot || "");
            },
            get hasWorkspace() {
                return Boolean(String(registry.lastInvocation?.workspaceRoot || registry.currentWorkspaceRoot || "").trim());
            },
            get current() {
                const rootPath = String(registry.lastInvocation?.workspaceRoot || registry.currentWorkspaceRoot || "");
                return {
                    rootPath,
                    hasWorkspace: Boolean(rootPath.trim()),
                };
            },
        },
        documents: {
            get active() {
                return {
                    resource: { ...(registry.lastInvocation?.resource || buildResourceContext()) },
                    target: { ...(registry.lastInvocation?.target || { kind: "", referenceId: "", path: "" }) },
                };
            },
            get resource() {
                return { ...(registry.lastInvocation?.resource || buildResourceContext()) };
            },
            get target() {
                return { ...(registry.lastInvocation?.target || { kind: "", referenceId: "", path: "" }) };
            },
        },
        references: {
            get current() {
                const target = registry.lastInvocation?.target || { kind: "", referenceId: "", path: "" };
                const resource = registry.lastInvocation?.resource || buildResourceContext();
                return {
                    id: String(registry.lastInvocation?.referenceId || target.referenceId || "").trim(),
                    hasReference: Boolean(String(registry.lastInvocation?.referenceId || target.referenceId || "").trim()),
                    pdfPath: resource.isPdf ? String(resource.path || "") : "",
                    target: { ...target },
                };
            },
            async readCurrentLibrary() {
                if (!registry.permissions?.readReferenceLibrary) {
                    throw new Error(`Extension ${registry.id} is not allowed to read the reference library`);
                }
                const result = await requestHostCall(registry, "references.readCurrentLibrary", {});
                return result && typeof result === "object" ? result : {};
            },
        },
        pdf: {
            get current() {
                const resource = registry.lastInvocation?.resource || buildResourceContext();
                const target = registry.lastInvocation?.target || { kind: "", referenceId: "", path: "" };
                return {
                    path: resource.isPdf ? String(resource.path || "") : "",
                    isPdf: Boolean(resource.isPdf),
                    filename: String(resource.filename || ""),
                    referenceId: String(registry.lastInvocation?.referenceId || target.referenceId || "").trim(),
                    target: { ...target },
                };
            },
            async extractText(filePath = "") {
                if (!canReadPdfContent(registry)) {
                    throw new Error(`Extension ${registry.id} is not allowed to inspect PDF content`);
                }
                const normalizedPath = String(filePath || registry.lastInvocation?.resource?.path || "").trim();
                if (!normalizedPath) {
                    throw new Error("PDF file path is required");
                }
                return await requestHostCall(registry, "pdf.extractText", {
                    filePath: normalizedPath,
                });
            },
            async extractMetadata(filePath = "") {
                if (!canReadPdfContent(registry)) {
                    throw new Error(`Extension ${registry.id} is not allowed to inspect PDF content`);
                }
                const normalizedPath = String(filePath || registry.lastInvocation?.resource?.path || "").trim();
                if (!normalizedPath) {
                    throw new Error("PDF file path is required");
                }
                const result = await requestHostCall(registry, "pdf.extractMetadata", {
                    filePath: normalizedPath,
                });
                return result && typeof result === "object" ? result : {};
            },
        },
        invocation: {
            get current() {
                return {
                    ...(registry.lastInvocation || createInvocationContext(registry)),
                    resource: { ...(registry.lastInvocation?.resource || buildResourceContext()) },
                    target: { ...(registry.lastInvocation?.target || { kind: "", referenceId: "", path: "" }) },
                };
            },
        },
        i18n: createI18nApi(registry),
        window: {
            async showInformationMessage(message) {
                emitWindowMessage(registry, "info", message);
                return undefined;
            },
            async showWarningMessage(message) {
                emitWindowMessage(registry, "warning", message);
                return undefined;
            },
            async showErrorMessage(message) {
                emitWindowMessage(registry, "error", message);
                return undefined;
            },
            async showQuickPick(items = [], options = {}) {
                const normalizedItems = Array.isArray(items)
                    ? items
                        .map((entry, index) => normalizeQuickPickItem(entry, index))
                        .filter((entry) => entry != null)
                    : [];
                return await requestUiInput(registry, "quickPick", {
                    title: String(options?.title || ""),
                    placeholder: String(options?.placeHolder || options?.placeholder || ""),
                    canPickMany: Boolean(options?.canPickMany),
                    items: normalizedItems,
                });
            },
            async showInputBox(options = {}) {
                return await requestUiInput(registry, "inputBox", {
                    title: String(options?.title || ""),
                    prompt: String(options?.prompt || ""),
                    placeholder: String(options?.placeHolder || options?.placeholder || ""),
                    value: String(options?.value || ""),
                    password: Boolean(options?.password),
                });
            },
        },
    };
}
function createActivationContext(api, payload = {}) {
    const subscriptions = [];
    return {
        subscriptions,
        activationEvent: String(payload.activationEvent || ""),
        extension: {
            id: String(payload.extensionId || ""),
            manifestPath: String(payload.manifestPath || ""),
            extensionPath: String(payload.extensionPath || ""),
        },
        commands: api.commands,
        menus: api.menus,
        capabilities: api.capabilities,
        views: api.views,
        settings: api.settings,
        workspace: api.workspace,
        documents: api.documents,
        references: api.references,
        pdf: api.pdf,
        tasks: api.tasks,
        process: api.process,
        invocation: api.invocation,
        globalState: api.globalState,
        workspaceState: api.workspaceState,
        window: api.window,
        i18n: api.i18n,
    };
}
async function loadExtensionModule(mainPath) {
    let normalized = String(mainPath || "").trim();
    if (!normalized) {
        throw new Error("Extension main entrypoint is empty");
    }
    if (!fs.existsSync(normalized) && normalized.endsWith(".js")) {
        const tsCandidate = `${normalized.slice(0, -3)}.ts`;
        if (fs.existsSync(tsCandidate)) {
            normalized = tsCandidate;
        }
    }
    return await import(pathToFileURL(normalized).href);
}
async function deactivateRecord(record) {
    if (!record || typeof record !== "object")
        return;
    if (typeof record.deactivate === "function") {
        await record.deactivate();
    }
    const subscriptions = Array.isArray(record.subscriptions) ? record.subscriptions : [];
    for (const subscription of subscriptions) {
        if (!subscription || typeof subscription.dispose !== "function")
            continue;
        subscription.dispose();
    }
}
async function ensureActivated(request) {
    const extensionId = String(request.extensionId || request.envelope?.extensionId || "").trim();
    const workspaceRoot = requestWorkspaceRoot(request);
    if (!extensionId) {
        throw new Error("Extension id is required");
    }
    const runtimeKey = extensionRuntimeKey(extensionId, workspaceRoot);
    let record = extensions.get(runtimeKey);
    if (record) {
        return record;
    }
    const extensionPath = String(request.extensionPath || "").trim();
    const manifestPath = String(request.manifestPath || "").trim();
    const mainEntry = String(request.mainEntry || "").trim();
    const resolvedMain = path.resolve(extensionPath, mainEntry);
    record = {
        id: extensionId,
        extensionPath,
        manifestPath,
        mainEntry,
        resolvedMain,
        commands: new Map(),
        commandMetadata: new Map(),
        menuActionMetadata: new Map(),
        capabilities: new Map(),
        capabilityContracts: new Map(),
        viewProviders: new Map(),
        treeViews: new Map(),
        treeViewControllers: new Map(),
        viewMetadata: new Map(),
        treeItems: new Map(),
        treeParents: new Map(),
        viewState: new Map(),
        viewStatePatches: new Map(),
        changedViews: new Set(),
        currentWorkspaceRoot: workspaceRoot,
        locale: normalizeLocale(request.activationState?.locale || request.envelope?.locale || "en-US"),
        messages: loadExtensionMessages(extensionPath, request.activationState?.locale || request.envelope?.locale || "en-US"),
        permissions: {
            readWorkspaceFiles: Boolean(request.permissions?.readWorkspaceFiles),
            readReferenceLibrary: Boolean(request.permissions?.readReferenceLibrary),
            spawnProcess: Boolean(request.permissions?.spawnProcess),
        },
        settings: new Map(),
        settingsEmitter: createEmitter(),
        globalState: new Map(),
        workspaceState: new Map(),
        lastInvocation: createInvocationContext({ id: extensionId, currentWorkspaceRoot: workspaceRoot }),
        subscriptions: [],
        runtimeKey,
    };
    const activationSettings = paramsToObject(request.activationState?.settings) || {};
    const activationGlobalState = paramsToObject(request.activationState?.globalState) || {};
    const activationWorkspaceState = paramsToObject(request.activationState?.workspaceState) || {};
    for (const [key, value] of Object.entries(activationSettings)) {
        record.settings.set(String(key || "").trim(), value);
    }
    for (const [key, value] of Object.entries(activationGlobalState)) {
        record.globalState.set(String(key || "").trim(), value);
    }
    for (const [key, value] of Object.entries(activationWorkspaceState)) {
        record.workspaceState.set(String(key || "").trim(), value);
    }
    const activationCapabilities = Array.isArray(request.capabilities)
        ? request.capabilities
        : [];
    for (const capability of activationCapabilities) {
        const id = String(capability?.id || "").trim();
        if (!id)
            continue;
        record.capabilityContracts.set(id, capability);
    }
    const api = createExtensionApi(record);
    const module = await loadExtensionModule(resolvedMain);
    const activate = typeof module.activate === "function" ? module.activate : null;
    const deactivate = typeof module.deactivate === "function" ? module.deactivate : null;
    if (!activate) {
        throw new Error(`Extension activate() not found: ${resolvedMain}`);
    }
    const context = createActivationContext(api, {
        activationEvent: request.activationEvent,
        extensionId,
        manifestPath,
        extensionPath,
    });
    await activate(context);
    record.subscriptions = context.subscriptions;
    record.deactivate = deactivate;
    extensions.set(runtimeKey, record);
    return record;
}
function paramsToObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return {};
    return value;
}
function normalizeTaskPatch(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return {};
    return value;
}
async function handleActivate(params = {}) {
    const record = await ensureActivated(params);
    return {
        kind: "Activate",
        payload: {
            extensionId: record.id,
            activated: true,
            reason: params.activationEvent
                ? `Activated by ${params.activationEvent}`
                : "Activated by host",
            registeredCommands: [...record.commands.keys()],
            registeredCapabilities: [...record.capabilities.keys()],
            registeredCommandDetails: [...record.commandMetadata.values()],
            registeredMenuActions: [...record.menuActionMetadata.values()],
            registeredViews: [
                ...new Set([
                    ...record.viewProviders.keys(),
                    ...record.treeViews.keys(),
                    ...record.treeViewControllers.keys(),
                    ...record.viewMetadata.keys(),
                ]),
            ],
            registeredViewDetails: [...record.viewMetadata.values()],
        },
    };
}
async function handleDeactivate(params = {}) {
    const extensionId = String(params.extensionId || "").trim();
    const workspaceRoot = requestWorkspaceRoot(params);
    if (!extensionId) {
        throw new Error("Extension id is required");
    }
    const runtimeKey = extensionRuntimeKey(extensionId, workspaceRoot);
    const record = extensions.get(runtimeKey);
    if (!record) {
        return {
            kind: "AcknowledgeDeactivation",
            payload: {
                extensionId,
                accepted: false,
            },
        };
    }
    await deactivateRecord(record);
    extensions.delete(runtimeKey);
    return {
        kind: "AcknowledgeDeactivation",
        payload: {
            extensionId,
            accepted: true,
        },
    };
}
async function handleInvokeCapability(params = {}) {
    const record = await ensureActivated(params);
    setInvocationContext(record, params.envelope || {});
    const capabilityId = String(params.envelope?.capability || "").trim();
    const provider = record.capabilities.get(capabilityId);
    if (!provider) {
        throw new Error(`Capability provider not registered: ${capabilityId}`);
    }
    record.changedViews.clear();
    const result = await provider(params.envelope);
    const changedViews = collectChangedViews(record, result?.changedViews);
    return {
        kind: "InvokeCapability",
        payload: {
            accepted: true,
            message: typeof result?.message === "string" && result.message.trim()
                ? result.message.trim()
                : `Extension host executed ${capabilityId}`,
            progressLabel: typeof result?.progressLabel === "string" && result.progressLabel.trim()
                ? result.progressLabel.trim()
                : "Handled by extension host",
            taskState: normalizeTaskState(result?.taskState, "succeeded"),
            changedViews,
            resultEntries: normalizeResultEntries(result?.resultEntries, record.id),
            artifacts: normalizeArtifactEntries(result?.artifacts, params.envelope || {}),
            outputs: normalizeOutputEntries(result?.outputs),
        },
    };
}
async function handleExecuteCommand(params = {}) {
    const record = await ensureActivated(params);
    setInvocationContext(record, params.envelope || {});
    const commandId = String(params.commandId || "").trim();
    const handler = record.commands.get(commandId);
    if (!handler) {
        throw new Error(`Command not registered: ${commandId}`);
    }
    record.changedViews.clear();
    const result = await handler(params.envelope || {});
    const changedViews = collectChangedViews(record, result?.changedViews);
    return {
        kind: "ExecuteCommand",
        payload: {
            accepted: true,
            message: typeof result?.message === "string" && result.message.trim()
                ? result.message.trim()
                : `Extension host executed ${commandId}`,
            progressLabel: typeof result?.progressLabel === "string" && result.progressLabel.trim()
                ? result.progressLabel.trim()
                : "Handled by extension command",
            taskState: normalizeTaskState(result?.taskState, "succeeded"),
            changedViews,
            resultEntries: normalizeResultEntries(result?.resultEntries, record.id),
            artifacts: normalizeArtifactEntries(result?.artifacts, params.envelope || {}),
            outputs: normalizeOutputEntries(result?.outputs),
        },
    };
}
async function handleResolveView(params = {}) {
    const record = await ensureActivated(params);
    setInvocationContext(record, params.envelope || {});
    const viewId = String(params.viewId || "").trim();
    const provider = record.viewProviders.get(viewId);
    const treeProvider = record.treeViews.get(viewId);
    if (!provider && !treeProvider) {
        throw new Error(`View provider not registered: ${viewId}`);
    }
    const parentItemId = String(params.parentItemId || "").trim();
    if (treeProvider) {
        return await handleResolveTreeView(record, treeProvider, viewId, parentItemId, params.envelope || {});
    }
    const result = await provider(params.envelope || {});
    const baselineState = resolveViewStateFromResult(viewId, result, record.id, params.envelope || {});
    const pushedState = record.viewStatePatches.get(viewId);
    const mergedState = mergeResolvedViewStateWithPushedState(baselineState, pushedState);
    record.viewState.set(viewId, mergedState);
    return {
        kind: "ResolveView",
        payload: {
            viewId,
            parentItemId,
            title: mergedState.title,
            description: mergedState.description,
            message: mergedState.message,
            badgeValue: mergedState.badgeValue,
            badgeTooltip: mergedState.badgeTooltip,
            statusLabel: mergedState.statusLabel,
            statusTone: mergedState.statusTone,
            actionLabel: mergedState.actionLabel,
            presentation: mergedState.presentation,
            sections: mergedState.sections,
            resultEntries: mergedState.resultEntries,
            artifacts: cloneArtifactEntries(mergedState.artifacts),
            outputs: normalizeOutputEntries(mergedState.outputs),
            items: Array.isArray(result?.items)
                ? normalizeViewItems(result.items, viewId)
                : [],
        },
    };
}
async function handleResolveTreeView(record, provider, viewId, parentItemId, envelope) {
    const treeItems = record.treeItems.get(viewId) || new Map();
    record.treeItems.set(viewId, treeItems);
    const treeParents = record.treeParents.get(viewId) || new Map();
    record.treeParents.set(viewId, treeParents);
    if (!parentItemId) {
        treeItems.clear();
        treeParents.clear();
    }
    const parentElement = parentItemId ? treeItems.get(parentItemId) : undefined;
    const children = await resolveTreeChildren(provider, parentElement, envelope);
    const items = [];
    for (const [index, element] of children.entries()) {
        const treeItem = await resolveTreeItem(provider, element, envelope);
        const normalized = normalizeTreeViewItem(treeItem, element, viewId, index);
        treeItems.set(normalized.handle, element);
        treeParents.set(normalized.handle, parentItemId);
        items.push(normalized);
    }
    return {
        kind: "ResolveView",
        payload: {
            viewId,
            parentItemId,
            title: resolveTreeViewTitle(provider, viewId, envelope),
            description: String(record.viewState.get(viewId)?.description || ""),
            message: String(record.viewState.get(viewId)?.message || ""),
            badgeValue: record.viewState.get(viewId)?.badgeValue ?? null,
            badgeTooltip: String(record.viewState.get(viewId)?.badgeTooltip || ""),
            statusLabel: String(record.viewState.get(viewId)?.statusLabel || ""),
            statusTone: String(record.viewState.get(viewId)?.statusTone || ""),
            actionLabel: String(record.viewState.get(viewId)?.actionLabel || ""),
            presentation: normalizeViewPresentation(record.viewState.get(viewId)?.presentation),
            sections: normalizeSidebarSections(record.viewState.get(viewId)?.sections || []),
            resultEntries: normalizeResultEntries(record.viewState.get(viewId)?.resultEntries || [], record.id),
            artifacts: cloneArtifactEntries(record.viewState.get(viewId)?.artifacts || []),
            outputs: normalizeOutputEntries(record.viewState.get(viewId)?.outputs || []),
            items,
        },
    };
}
async function resolveTreeChildren(provider, element, envelope) {
    if (typeof provider?.getChildren !== "function")
        return [];
    const result = await provider.getChildren(element, envelope);
    return Array.isArray(result) ? result : [];
}
async function resolveTreeItem(provider, element, envelope) {
    if (typeof provider?.getTreeItem === "function") {
        return await provider.getTreeItem(element, envelope);
    }
    return element;
}
function resolveTreeViewTitle(provider, viewId, envelope) {
    if (typeof provider?.getTitle === "function") {
        const title = provider.getTitle(envelope);
        if (typeof title === "string" && title.trim())
            return title.trim();
    }
    return viewId;
}
function normalizeTreeViewItem(treeItem = {}, element = {}, viewId = "", index = 0) {
    const handle = String(treeItem?.handle || treeItem?.id || element?.handle || element?.id || `${viewId}:${index}`).trim();
    const id = String(treeItem?.id || element?.id || handle).trim();
    const nestedChildren = Array.isArray(treeItem?.children)
        ? normalizeViewItems(treeItem.children, `${viewId}:${index}`)
        : [];
    return {
        id,
        handle,
        label: String(treeItem?.label || treeItem?.title || element?.label || element?.title || id || `Item ${index + 1}`),
        description: String(treeItem?.description || element?.description || ""),
        tooltip: String(treeItem?.tooltip || element?.tooltip || ""),
        contextValue: String(treeItem?.contextValue || treeItem?.context_value || element?.contextValue || element?.context_value || ""),
        icon: String(treeItem?.icon || element?.icon || ""),
        commandId: String(treeItem?.commandId || treeItem?.command || element?.commandId || element?.command || ""),
        commandArguments: Array.isArray(treeItem?.commandArguments)
            ? treeItem.commandArguments
            : Array.isArray(element?.commandArguments)
                ? element.commandArguments
                : [],
        collapsibleState: normalizeCollapsibleState(treeItem?.collapsibleState || element?.collapsibleState, nestedChildren.length > 0),
        children: nestedChildren,
    };
}
function createEmptyViewState(viewId = "") {
    return {
        title: String(viewId || "").trim(),
        description: "",
        message: "",
        badgeValue: null,
        badgeTooltip: "",
        statusLabel: "",
        statusTone: "",
        actionLabel: "",
        presentation: normalizeViewPresentation({}),
        sections: [],
        resultEntries: [],
        artifacts: [],
        outputs: [],
    };
}
function resolveViewStateFromResult(viewId = "", result = {}, extensionId = "", envelope = {}) {
    return {
        title: typeof result?.title === "string" && result.title.trim()
            ? result.title.trim()
            : String(viewId || "").trim(),
        description: typeof result?.description === "string" ? result.description : "",
        message: typeof result?.message === "string" ? result.message : "",
        badgeValue: Number.isInteger(result?.badgeValue) ? result.badgeValue : null,
        badgeTooltip: typeof result?.badgeTooltip === "string" ? result.badgeTooltip : "",
        statusLabel: typeof result?.statusLabel === "string" ? result.statusLabel : "",
        statusTone: typeof result?.statusTone === "string" ? result.statusTone : "",
        actionLabel: typeof result?.actionLabel === "string" ? result.actionLabel : "",
        presentation: normalizeViewPresentation(result?.presentation),
        sections: normalizeSidebarSections(result?.sections),
        resultEntries: normalizeResultEntries(result?.resultEntries, extensionId),
        artifacts: normalizeArtifactEntries(result?.artifacts, envelope, {
            preferExplicitMetadata: true,
        }),
        outputs: normalizeOutputEntries(result?.outputs),
    };
}
function mergeViewStatePatch(current = {}, patch = {}, registry) {
    return {
        ...current,
        title: typeof patch?.title === "string" && patch.title.trim() ? patch.title.trim() : current.title,
        description: typeof patch?.description === "string" ? patch.description : current.description,
        message: typeof patch?.message === "string" ? patch.message : current.message,
        badgeValue: Number.isInteger(patch?.badgeValue) ? patch.badgeValue : current.badgeValue,
        badgeTooltip: typeof patch?.badgeTooltip === "string" ? patch.badgeTooltip : current.badgeTooltip,
        statusLabel: typeof patch?.statusLabel === "string" ? patch.statusLabel : current.statusLabel,
        statusTone: typeof patch?.statusTone === "string" ? patch.statusTone : current.statusTone,
        actionLabel: typeof patch?.actionLabel === "string" ? patch.actionLabel : current.actionLabel,
        presentation: patch?.presentation && typeof patch.presentation === "object" && !Array.isArray(patch.presentation)
            ? normalizeViewPresentation(patch.presentation)
            : current.presentation,
        sections: Array.isArray(patch?.sections) ? normalizeSidebarSections(patch.sections) : current.sections,
        resultEntries: Array.isArray(patch?.resultEntries)
            ? normalizeResultEntries(patch.resultEntries, registry.id)
            : current.resultEntries,
        artifacts: Array.isArray(patch?.artifacts)
            ? normalizeArtifactEntries(patch.artifacts, registry.lastInvocation || {}, {
                preferExplicitMetadata: true,
            })
            : current.artifacts,
        outputs: Array.isArray(patch?.outputs) ? normalizeOutputEntries(patch.outputs) : current.outputs,
    };
}
function extractViewStatePatch(current = {}, patch = {}, registry) {
    const next = {};
    if (typeof patch?.title === "string" && patch.title.trim())
        next.title = patch.title.trim();
    if (typeof patch?.description === "string")
        next.description = patch.description;
    if (typeof patch?.message === "string")
        next.message = patch.message;
    if (Number.isInteger(patch?.badgeValue))
        next.badgeValue = patch.badgeValue;
    if (typeof patch?.badgeTooltip === "string")
        next.badgeTooltip = patch.badgeTooltip;
    if (typeof patch?.statusLabel === "string")
        next.statusLabel = patch.statusLabel;
    if (typeof patch?.statusTone === "string")
        next.statusTone = patch.statusTone;
    if (typeof patch?.actionLabel === "string")
        next.actionLabel = patch.actionLabel;
    if (patch?.presentation && typeof patch.presentation === "object" && !Array.isArray(patch.presentation)) {
        next.presentation = normalizeViewPresentation(patch.presentation);
    }
    if (Array.isArray(patch?.sections))
        next.sections = normalizeSidebarSections(patch.sections);
    if (Array.isArray(patch?.resultEntries))
        next.resultEntries = normalizeResultEntries(patch.resultEntries, registry.id);
    if (Array.isArray(patch?.artifacts)) {
        next.artifacts = normalizeArtifactEntries(patch.artifacts, registry.lastInvocation || {}, {
            preferExplicitMetadata: true,
        });
    }
    if (Array.isArray(patch?.outputs))
        next.outputs = normalizeOutputEntries(patch.outputs);
    return {
        ...(current && typeof current === "object" ? current : {}),
        ...next,
    };
}
function mergeResolvedViewStateWithPushedState(baseline = {}, pushed = {}) {
    if (!pushed || typeof pushed !== "object") {
        return baseline;
    }
    return {
        ...baseline,
        title: typeof pushed.title === "string" && pushed.title.trim() ? pushed.title.trim() : baseline.title,
        description: typeof pushed.description === "string" ? pushed.description : baseline.description,
        message: typeof pushed.message === "string" ? pushed.message : baseline.message,
        badgeValue: Number.isInteger(pushed.badgeValue) ? pushed.badgeValue : baseline.badgeValue,
        badgeTooltip: typeof pushed.badgeTooltip === "string" ? pushed.badgeTooltip : baseline.badgeTooltip,
        statusLabel: typeof pushed.statusLabel === "string" ? pushed.statusLabel : baseline.statusLabel,
        statusTone: typeof pushed.statusTone === "string" ? pushed.statusTone : baseline.statusTone,
        actionLabel: typeof pushed.actionLabel === "string" ? pushed.actionLabel : baseline.actionLabel,
        presentation: pushed.presentation && typeof pushed.presentation === "object" && !Array.isArray(pushed.presentation)
            ? normalizeViewPresentation(pushed.presentation)
            : baseline.presentation,
        sections: Array.isArray(pushed.sections) ? pushed.sections : baseline.sections,
        resultEntries: Array.isArray(pushed.resultEntries) ? pushed.resultEntries : baseline.resultEntries,
        artifacts: Array.isArray(pushed.artifacts) ? pushed.artifacts : baseline.artifacts,
        outputs: Array.isArray(pushed.outputs) ? pushed.outputs : baseline.outputs,
    };
}
function normalizeViewItems(items = [], viewId = "") {
    return items.map((item, index) => ({
        id: String(item?.id || `${viewId}:${index}`),
        handle: String(item?.handle || item?.id || `${viewId}:${index}`),
        label: String(item?.label || item?.title || item?.id || `Item ${index + 1}`),
        description: String(item?.description || ""),
        tooltip: String(item?.tooltip || ""),
        contextValue: String(item?.contextValue || item?.context_value || ""),
        icon: String(item?.icon || ""),
        commandId: String(item?.commandId || item?.command || ""),
        commandArguments: Array.isArray(item?.commandArguments) ? item.commandArguments : [],
        collapsibleState: normalizeCollapsibleState(item?.collapsibleState || item?.collapsible_state, Array.isArray(item?.children) && item.children.length > 0),
        children: Array.isArray(item?.children)
            ? normalizeViewItems(item.children, `${viewId}:${index}`)
            : [],
    }));
}
function normalizeQuickPickItem(entry, index = 0) {
    if (typeof entry === "string") {
        const label = entry.trim();
        if (!label)
            return null;
        return {
            id: `${index}`,
            label,
            description: "",
            detail: "",
            picked: false,
            value: label,
        };
    }
    if (!entry || typeof entry !== "object")
        return null;
    const label = String(entry.label || entry.value || "").trim();
    if (!label)
        return null;
    return {
        id: String(entry.id || `${index}`),
        label,
        description: String(entry.description || ""),
        detail: String(entry.detail || ""),
        picked: Boolean(entry.picked),
        value: Object.prototype.hasOwnProperty.call(entry, "value") ? entry.value : label,
    };
}
function normalizeCollapsibleState(value, hasChildren = false) {
    const normalized = String(value || "").trim();
    if (normalized === "expanded" || normalized === "collapsed" || normalized === "none") {
        return normalized;
    }
    return hasChildren ? "collapsed" : "none";
}
function collectChangedViews(record, rawChangedViews) {
    const changedViews = new Set();
    if (Array.isArray(rawChangedViews)) {
        for (const entry of rawChangedViews) {
            const id = String(entry || "").trim();
            if (id)
                changedViews.add(id);
        }
    }
    for (const entry of record.changedViews) {
        const id = String(entry || "").trim();
        if (id)
            changedViews.add(id);
    }
    record.changedViews.clear();
    return [...changedViews];
}
async function dispatchRequest(request) {
    if (!request || typeof request !== "object") {
        throw new Error("Invalid extension host request");
    }
    if (request.method === "RespondUiRequest") {
        return handleRespondUiRequest(request.params || {});
    }
    if (request.method === "ResolveHostCall") {
        return handleResolveHostCall(request.params || {});
    }
    if (request.method === "UpdateSettings") {
        return handleUpdateSettings(request.params || {});
    }
    if (request.method === "NotifyViewSelection") {
        return handleNotifyViewSelection(request.params || {});
    }
    if (request.method === "Activate") {
        return await handleActivate(request.params || {});
    }
    if (request.method === "Deactivate") {
        return await handleDeactivate(request.params || {});
    }
    if (request.method === "InvokeCapability") {
        return await handleInvokeCapability(request.params || {});
    }
    if (request.method === "ExecuteCommand") {
        return await handleExecuteCommand(request.params || {});
    }
    if (request.method === "ResolveView") {
        return await handleResolveView(request.params || {});
    }
    throw new Error(`Unknown extension host method: ${String(request.method || "")}`);
}
function handleRespondUiRequest(params = {}) {
    const requestId = String(params.requestId || "").trim();
    if (!requestId) {
        throw new Error("UI request id is required");
    }
    const pending = pendingUiRequests.get(requestId);
    if (!pending) {
        throw new Error(`Pending UI request not found: ${requestId}`);
    }
    pendingUiRequests.delete(requestId);
    if (params.cancelled) {
        pending.resolve(undefined);
    }
    else {
        pending.resolve(params.result);
    }
    return {
        kind: "AcknowledgeUiRequest",
        payload: {
            requestId,
            accepted: true,
        },
    };
}
function handleResolveHostCall(params = {}) {
    const requestId = String(params.requestId || "").trim();
    if (!requestId) {
        throw new Error("Host call request id is required");
    }
    const pending = pendingHostCalls.get(requestId);
    if (!pending) {
        throw new Error(`Pending host call not found: ${requestId}`);
    }
    pendingHostCalls.delete(requestId);
    if (params.accepted === false) {
        pending.reject(new Error(String(params.error || "Host call rejected")));
    }
    else if (String(params.error || "").trim()) {
        pending.reject(new Error(String(params.error || "")));
    }
    else {
        pending.resolve(params.result);
    }
    return {
        kind: "AcknowledgeHostCall",
        payload: {
            requestId,
            accepted: true,
        },
    };
}
function handleUpdateSettings(params = {}) {
    const extensionId = String(params.extensionId || "").trim();
    const workspaceRoot = requestWorkspaceRoot(params);
    if (!extensionId) {
        throw new Error("Extension id is required");
    }
    const registry = extensions.get(extensionRuntimeKey(extensionId, workspaceRoot));
    if (!registry) {
        return {
            kind: "AcknowledgeSettingsUpdate",
            payload: {
                extensionId,
                accepted: false,
                changedKeys: [],
            },
        };
    }
    const nextSettings = normalizeSettingsObject(params.settings);
    const previousSettings = new Map(registry.settings.entries());
    const changedKeys = [];
    registry.settings.clear();
    for (const [key, value] of Object.entries(nextSettings)) {
        const normalizedKey = String(key || "").trim();
        if (!normalizedKey)
            continue;
        registry.settings.set(normalizedKey, value);
        if (!previousSettings.has(normalizedKey) || previousSettings.get(normalizedKey) !== value) {
            changedKeys.push(normalizedKey);
        }
    }
    for (const key of previousSettings.keys()) {
        if (!registry.settings.has(key)) {
            changedKeys.push(key);
        }
    }
    if (changedKeys.length > 0) {
        emitSettingsChanged(registry, changedKeys);
    }
    return {
        kind: "AcknowledgeSettingsUpdate",
        payload: {
            extensionId,
            accepted: true,
            changedKeys,
        },
    };
}
function createTreeViewController(registry, viewId = "") {
    const selectionEmitter = createEmitter();
    const controller = {
        api: {
            onDidChangeSelection(listener) {
                return selectionEmitter.event(listener);
            },
            reveal(itemOrHandle, options = {}) {
                const itemHandle = resolveTreeItemHandle(registry, viewId, itemOrHandle);
                if (!itemHandle)
                    return;
                writeMessage({
                    kind: "ViewRevealRequested",
                    payload: {
                        extensionId: registry.id,
                        workspaceRoot: String(registry.currentWorkspaceRoot || ""),
                        viewId,
                        itemHandle,
                        parentHandles: collectTreeParentHandles(registry, viewId, itemHandle),
                        focus: Boolean(options?.focus),
                        select: options?.select !== false,
                        expand: options?.expand !== false,
                    },
                });
            },
        },
        selectionEmitter,
    };
    return controller;
}
function handleNotifyViewSelection(params = {}) {
    const extensionId = String(params.extensionId || "").trim();
    const workspaceRoot = requestWorkspaceRoot(params);
    const viewId = String(params.viewId || "").trim();
    const itemHandle = String(params.itemHandle || "").trim();
    if (!extensionId || !viewId) {
        throw new Error("Extension id and view id are required");
    }
    const registry = extensions.get(extensionRuntimeKey(extensionId, workspaceRoot));
    if (!registry) {
        throw new Error(`Extension not activated: ${extensionId}`);
    }
    const controller = registry.treeViewControllers.get(viewId);
    if (!controller) {
        return {
            kind: "AcknowledgeViewSelection",
            payload: {
                extensionId,
                viewId,
                accepted: false,
            },
        };
    }
    const treeItems = registry.treeItems.get(viewId) || new Map();
    const element = itemHandle ? treeItems.get(itemHandle) : undefined;
    controller.selectionEmitter.fire({
        selection: element != null ? [element] : [],
        handles: itemHandle ? [itemHandle] : [],
    });
    return {
        kind: "AcknowledgeViewSelection",
        payload: {
            extensionId,
            viewId,
            accepted: true,
        },
    };
}
const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
});
rl.on("line", async (line) => {
    try {
        const request = JSON.parse(line);
        writeMessage(await dispatchRequest(request));
    }
    catch (error) {
        writeMessage({
            kind: "Error",
            payload: {
                message: error?.message || String(error || "Unknown extension host error"),
            },
        });
    }
});
