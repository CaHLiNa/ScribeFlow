use serde_json::{Map, Value};

pub const SKILL_FILE_NAME: &str = "SKILL.md";
const MAX_SKILL_DESCRIPTION_LENGTH: usize = 220;

#[derive(Debug, Clone)]
pub struct ParsedSkillMarkdown {
    pub name: String,
    pub slug: String,
    pub description: String,
    pub frontmatter: Map<String, Value>,
    pub body: String,
}

fn trim_text(value: &str, max_chars: usize) -> String {
    let normalized = value.trim();
    if normalized.is_empty() {
        return String::new();
    }
    if max_chars == 0 || normalized.chars().count() <= max_chars {
        return normalized.to_string();
    }
    let trimmed = normalized.chars().take(max_chars).collect::<String>();
    format!("{}...", trimmed.trim_end())
}

pub fn slugify_skill_name(value: &str) -> String {
    let mut slug = String::new();
    let mut previous_dash = false;

    for ch in value.trim().chars() {
        let next = ch.to_ascii_lowercase();
        if next.is_ascii_alphanumeric() {
            slug.push(next);
            previous_dash = false;
        } else if !previous_dash {
            slug.push('-');
            previous_dash = true;
        }
    }

    slug.trim_matches('-').to_string()
}

fn get_indent_width(line: &str) -> usize {
    line.chars().take_while(|ch| ch.is_whitespace()).count()
}

fn normalize_block_scalar_value(lines: &[String], style: char) -> String {
    if style == '|' {
        return lines.join("\n").trim().to_string();
    }

    let mut paragraphs = Vec::new();
    let mut current = Vec::new();
    for line in lines {
        if line.trim().is_empty() {
            if !current.is_empty() {
                paragraphs.push(current.join(" ").trim().to_string());
                current.clear();
            } else if !paragraphs
                .last()
                .map(|item| item.is_empty())
                .unwrap_or(true)
            {
                paragraphs.push(String::new());
            }
            continue;
        }
        current.push(line.trim().to_string());
    }

    if !current.is_empty() {
        paragraphs.push(current.join(" ").trim().to_string());
    }

    paragraphs.join("\n\n").trim().to_string()
}

fn read_block_scalar(lines: &[&str], start_index: usize, style: char) -> (String, usize) {
    let mut collected = Vec::new();
    let mut block_indent: Option<usize> = None;
    let mut index = start_index + 1;

    while index < lines.len() {
        let raw_line = lines[index];
        let trimmed = raw_line.trim();

        if trimmed.is_empty() {
            collected.push(String::new());
            index += 1;
            continue;
        }

        let indent = get_indent_width(raw_line);
        if block_indent.is_none() {
            if indent == 0 {
                break;
            }
            block_indent = Some(indent);
        }

        if indent < block_indent.unwrap_or(0) {
            break;
        }

        collected.push(raw_line[block_indent.unwrap_or(0)..].to_string());
        index += 1;
    }

    (
        normalize_block_scalar_value(&collected, style),
        index.saturating_sub(1),
    )
}

fn extract_frontmatter(markdown: &str) -> (Map<String, Value>, String) {
    let source = markdown.trim();
    let Some(stripped) = source.strip_prefix("---\n") else {
        return (Map::new(), source.to_string());
    };
    let Some(frontmatter_end) = stripped.find("\n---") else {
        return (Map::new(), source.to_string());
    };

    let frontmatter_block = &stripped[..frontmatter_end];
    let body_start = frontmatter_end + "\n---".len();
    let body = stripped[body_start..].trim().to_string();
    let mut frontmatter = Map::new();
    let lines = frontmatter_block.split('\n').collect::<Vec<_>>();

    let mut index = 0;
    while index < lines.len() {
        let line = lines[index];
        if let Some((raw_key, raw_value)) = line.split_once(':') {
            let key = raw_key.trim();
            let value = raw_value.trim();
            if key.is_empty() {
                index += 1;
                continue;
            }

            if matches!(value.chars().next(), Some('|') | Some('>')) {
                let style = value.chars().next().unwrap_or('|');
                let (block, next_index) = read_block_scalar(&lines, index, style);
                frontmatter.insert(key.to_string(), Value::String(block));
                index = next_index + 1;
                continue;
            }

            frontmatter.insert(
                key.to_string(),
                Value::String(value.trim_matches('"').trim_matches('\'').to_string()),
            );
        }
        index += 1;
    }

    (frontmatter, body)
}

fn extract_first_paragraph(body: &str) -> String {
    for paragraph in body
        .replace("\r\n", "\n")
        .split("\n\n")
        .map(|entry| entry.trim())
        .filter(|entry| !entry.is_empty())
    {
        if paragraph.starts_with('#') && !paragraph.contains('\n') {
            continue;
        }
        return paragraph.trim_start_matches('#').trim().to_string();
    }
    String::new()
}

pub fn parse_skill_markdown(markdown: &str, fallback_name: &str) -> ParsedSkillMarkdown {
    let (frontmatter, body) = extract_frontmatter(markdown);
    let name = frontmatter
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or(fallback_name)
        .trim();
    let resolved_name = if name.is_empty() {
        "unnamed-skill".to_string()
    } else {
        name.to_string()
    };
    let description = frontmatter
        .get("description")
        .and_then(Value::as_str)
        .map(|value| trim_text(value, MAX_SKILL_DESCRIPTION_LENGTH))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| {
            trim_text(
                &extract_first_paragraph(&body),
                MAX_SKILL_DESCRIPTION_LENGTH,
            )
        });

    ParsedSkillMarkdown {
        slug: slugify_skill_name(&resolved_name),
        name: resolved_name,
        description,
        frontmatter,
        body,
    }
}

fn stringify_frontmatter_value(value: &str) -> String {
    let normalized = value.trim();
    if normalized.is_empty() {
        return "\"\"".to_string();
    }
    if normalized.chars().any(|ch| {
        matches!(
            ch,
            ':' | '#' | '\n' | '\r' | '\t' | '"' | '\'' | '[' | ']' | '{' | '}'
        )
    }) || normalized.starts_with(char::is_whitespace)
        || normalized.ends_with(char::is_whitespace)
    {
        return serde_json::to_string(normalized).unwrap_or_else(|_| "\"\"".to_string());
    }
    normalized.to_string()
}

pub fn build_skill_markdown(
    name: &str,
    description: &str,
    body: &str,
    frontmatter: Option<&Map<String, Value>>,
) -> String {
    let normalized_name = name.trim();
    let normalized_description = description.trim();
    let normalized_body = body.trim();
    let mut merged = frontmatter.cloned().unwrap_or_default();
    merged.insert(
        "name".to_string(),
        Value::String(normalized_name.to_string()),
    );
    if normalized_description.is_empty() {
        merged.remove("description");
    } else {
        merged.insert(
            "description".to_string(),
            Value::String(normalized_description.to_string()),
        );
    }

    let mut ordered = vec![("name".to_string(), normalized_name.to_string())];
    if !normalized_description.is_empty() {
        ordered.push((
            "description".to_string(),
            normalized_description.to_string(),
        ));
    }
    for (key, value) in merged {
        if key == "name" || key == "description" {
            continue;
        }
        let text = value
            .as_str()
            .map(|entry| entry.trim().to_string())
            .unwrap_or_default();
        if !text.is_empty() {
            ordered.push((key, text));
        }
    }

    let mut lines = vec!["---".to_string()];
    for (key, value) in ordered {
        lines.push(format!("{key}: {}", stringify_frontmatter_value(&value)));
    }
    lines.push("---".to_string());
    lines.push(String::new());
    if normalized_body.is_empty() {
        lines.push(format!("# {normalized_name}"));
        lines.push(String::new());
        lines.push("Describe how this skill should be used.".to_string());
    } else {
        lines.push(normalized_body.to_string());
    }
    lines.push(String::new());
    lines.join("\n")
}

pub fn rewrite_skill_markdown(
    markdown: &str,
    next_name: &str,
    next_description: Option<&str>,
    next_body: Option<&str>,
    fallback_frontmatter: Option<&Map<String, Value>>,
) -> String {
    let parsed = parse_skill_markdown(markdown, next_name);
    let mut frontmatter = if parsed.frontmatter.is_empty() {
        fallback_frontmatter.cloned().unwrap_or_default()
    } else {
        parsed.frontmatter
    };

    let description = next_description
        .map(|value| value.trim().to_string())
        .unwrap_or_else(|| {
            frontmatter
                .get("description")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .trim()
                .to_string()
        });
    let body = next_body
        .map(|value| value.trim().to_string())
        .unwrap_or_else(|| parsed.body.trim().to_string());

    frontmatter.insert(
        "name".to_string(),
        Value::String(next_name.trim().to_string()),
    );
    if description.is_empty() {
        frontmatter.remove("description");
    } else {
        frontmatter.insert(
            "description".to_string(),
            Value::String(description.clone()),
        );
    }

    build_skill_markdown(next_name, &description, &body, Some(&frontmatter))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_skill_markdown_reads_frontmatter_and_body() {
        let parsed = parse_skill_markdown(
            "---\nname: revise-with-citations\ndescription: Tighten draft\n---\n\n# Step\n\nBody text",
            "fallback",
        );

        assert_eq!(parsed.name, "revise-with-citations");
        assert_eq!(parsed.slug, "revise-with-citations");
        assert_eq!(parsed.description, "Tighten draft");
        assert_eq!(parsed.body, "# Step\n\nBody text");
    }

    #[test]
    fn rewrite_skill_markdown_updates_name_and_body() {
        let rewritten = rewrite_skill_markdown(
            "---\nname: alpha\n---\n\n# Old",
            "beta",
            Some("Desc"),
            Some("# New"),
            None,
        );

        assert!(rewritten.contains("name: beta"));
        assert!(rewritten.contains("description: Desc"));
        assert!(rewritten.contains("# New"));
    }
}
