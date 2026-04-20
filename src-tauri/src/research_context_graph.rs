use serde_json::{json, Value};

fn trim(value: &str) -> String {
    value.trim().to_string()
}

fn string_field(value: &Value, keys: &[&str]) -> String {
    for key in keys {
        if let Some(entry) = value.get(*key).and_then(Value::as_str) {
            let normalized = trim(entry);
            if !normalized.is_empty() {
                return normalized;
            }
        }
    }
    String::new()
}

fn bool_field(value: &Value, keys: &[&str]) -> bool {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_bool))
        .unwrap_or(false)
}

fn array_field(value: &Value, keys: &[&str]) -> Vec<String> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_array).cloned())
        .unwrap_or_default()
        .into_iter()
        .filter_map(|entry| entry.as_str().map(trim))
        .filter(|entry| !entry.is_empty())
        .collect()
}

fn push_node(nodes: &mut Vec<Value>, node_id: &str, kind: &str, label: String) {
    if node_id.is_empty() || nodes.iter().any(|entry| entry["id"] == node_id) {
        return;
    }
    nodes.push(json!({
        "id": node_id,
        "kind": kind,
        "label": label,
    }));
}

fn push_edge(edges: &mut Vec<Value>, from: &str, to: &str, relation: &str) {
    if from.is_empty()
        || to.is_empty()
        || edges.iter().any(|entry| {
            entry["from"] == from && entry["to"] == to && entry["relation"] == relation
        })
    {
        return;
    }
    edges.push(json!({
        "from": from,
        "to": to,
        "relation": relation,
    }));
}

pub(crate) fn build_research_context_graph(
    context_bundle: &Value,
    resolved_task: &Value,
    required_evidence: &[String],
) -> Value {
    let mut nodes = Vec::new();
    let mut edges = Vec::new();

    let task_id = format!(
        "task:{}",
        trim(&string_field(resolved_task, &["kind"]))
            .if_empty_then(|| "general-research".to_string())
    );
    let task_title = string_field(resolved_task, &["title"]);
    push_node(
        &mut nodes,
        &task_id,
        "task",
        if task_title.is_empty() {
            "Research task".to_string()
        } else {
            task_title
        },
    );

    let workspace = context_bundle.get("workspace").unwrap_or(&Value::Null);
    let workspace_path = string_field(workspace, &["path"]);
    if !workspace_path.is_empty() {
        let workspace_node = format!("workspace:{workspace_path}");
        push_node(
            &mut nodes,
            &workspace_node,
            "workspace",
            workspace_path.clone(),
        );
        push_edge(&mut edges, &task_id, &workspace_node, "scoped-to");
    }

    let document = context_bundle.get("document").unwrap_or(&Value::Null);
    let document_path = string_field(document, &["filePath", "file_path"]);
    if bool_field(document, &["available"]) && !document_path.is_empty() {
        let document_node = format!("document:{document_path}");
        push_node(
            &mut nodes,
            &document_node,
            "document",
            string_field(document, &["label", "filePath", "file_path"])
                .if_empty_then(|| document_path.clone()),
        );
        push_edge(&mut edges, &task_id, &document_node, "uses-document");
    }

    let selection = context_bundle.get("selection").unwrap_or(&Value::Null);
    if bool_field(selection, &["available"]) {
        let selection_path = string_field(selection, &["filePath", "file_path"]);
        let selection_node = format!(
            "selection:{}:{}",
            selection_path,
            string_field(selection, &["from", "to"])
        );
        let selection_label = string_field(selection, &["preview", "text"]);
        push_node(
            &mut nodes,
            &selection_node,
            "selection",
            if selection_label.is_empty() {
                "Current selection".to_string()
            } else {
                selection_label
            },
        );
        push_edge(&mut edges, &task_id, &selection_node, "focuses-on");
    }

    let reference = context_bundle.get("reference").unwrap_or(&Value::Null);
    let reference_id = string_field(reference, &["id"]);
    let citation_key = string_field(reference, &["citationKey", "citation_key"]);
    if bool_field(reference, &["available"])
        && (!reference_id.is_empty() || !citation_key.is_empty())
    {
        let reference_node = format!(
            "reference:{}",
            if reference_id.is_empty() {
                citation_key.clone()
            } else {
                reference_id.clone()
            }
        );
        push_node(
            &mut nodes,
            &reference_node,
            "reference",
            [citation_key.clone(), string_field(reference, &["title"])]
                .into_iter()
                .filter(|entry| !entry.is_empty())
                .collect::<Vec<_>>()
                .join(" · ")
                .if_empty_then(|| "Selected reference".to_string()),
        );
        push_edge(&mut edges, &task_id, &reference_node, "uses-reference");
    }

    for evidence_kind in required_evidence {
        let evidence_node = format!("evidence:{evidence_kind}");
        push_node(
            &mut nodes,
            &evidence_node,
            "evidence-kind",
            evidence_kind.to_string(),
        );
        push_edge(&mut edges, &task_id, &evidence_node, "requires-evidence");
    }

    let selected_artifacts = array_field(resolved_task, &["selectedArtifacts"]);
    for artifact_type in selected_artifacts {
        let artifact_node = format!("artifact:{artifact_type}");
        push_node(
            &mut nodes,
            &artifact_node,
            "artifact-type",
            artifact_type.clone(),
        );
        push_edge(&mut edges, &task_id, &artifact_node, "produces");
    }

    json!({
        "nodes": nodes,
        "edges": edges,
    })
}

trait StringExt {
    fn if_empty_then<F: FnOnce() -> String>(self, fallback: F) -> String;
}

impl StringExt for String {
    fn if_empty_then<F: FnOnce() -> String>(self, fallback: F) -> String {
        if self.trim().is_empty() {
            fallback()
        } else {
            self
        }
    }
}
