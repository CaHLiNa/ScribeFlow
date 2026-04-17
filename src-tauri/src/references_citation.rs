use hayagriva::citationberg::{LocaleFile, Style};
use hayagriva::{
    BibliographyDriver, BibliographyRequest, BufWriteFormat, CitationItem, CitationRequest,
};
use serde::Deserialize;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CitationFormatParams {
    #[serde(default)]
    pub style: String,
    #[serde(default)]
    pub mode: String,
    #[serde(default)]
    pub reference: Value,
    #[serde(default)]
    pub number: Option<usize>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CitationBibliographyParams {
    #[serde(default)]
    pub style: String,
    #[serde(default)]
    pub references: Vec<Value>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CitationCslFormatParams {
    #[serde(default)]
    pub style_id: String,
    #[serde(default)]
    pub mode: String,
    #[serde(default)]
    pub csl_items: Vec<Value>,
    #[serde(default)]
    pub number: Option<usize>,
    #[serde(default)]
    pub locale: String,
    #[serde(default)]
    pub workspace_path: String,
}

fn trim_string(value: Option<&Value>) -> String {
    value
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or_default()
        .to_string()
}

fn get_year(reference: &Value) -> String {
    reference
        .get("year")
        .and_then(Value::as_i64)
        .map(|value| value.to_string())
        .unwrap_or_else(|| "n.d.".to_string())
}

fn get_authors(reference: &Value) -> Vec<(String, String)> {
    reference
        .get("authors")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|author| author.as_str().map(|value| value.to_string()))
        .map(|author| {
            let parts = author.split_whitespace().collect::<Vec<_>>();
            if parts.len() <= 1 {
                (String::new(), author)
            } else {
                (
                    parts[..parts.len().saturating_sub(1)].join(" "),
                    parts.last().copied().unwrap_or_default().to_string(),
                )
            }
        })
        .collect()
}

fn italicize(value: &str) -> String {
    format!("*{value}*")
}

fn initials(given: &str) -> String {
    given
        .split([' ', '-'])
        .filter(|segment| !segment.is_empty())
        .map(|segment| format!("{}.", &segment[..1]))
        .collect::<Vec<_>>()
        .join(" ")
}

fn author_last_initials(author: &(String, String)) -> String {
    if author.0.is_empty() {
        author.1.clone()
    } else {
        format!("{}, {}", author.1, initials(&author.0))
    }
}

fn author_last(author: &(String, String)) -> String {
    if author.1.is_empty() {
        author.0.clone()
    } else {
        author.1.clone()
    }
}

fn author_last_first(author: &(String, String)) -> String {
    if author.0.is_empty() {
        author.1.clone()
    } else {
        format!("{}, {}", author.1, author.0)
    }
}

fn author_first_last(author: &(String, String)) -> String {
    if author.0.is_empty() {
        author.1.clone()
    } else {
        format!("{} {}", author.0, author.1)
    }
}

fn apa_authors(authors: &[(String, String)]) -> String {
    match authors.len() {
        0 => String::new(),
        1 => author_last_initials(&authors[0]),
        2 => format!(
            "{} & {}",
            author_last_initials(&authors[0]),
            author_last_initials(&authors[1])
        ),
        len if len <= 20 => format!(
            "{}, & {}",
            authors[..len - 1]
                .iter()
                .map(author_last_initials)
                .collect::<Vec<_>>()
                .join(", "),
            author_last_initials(&authors[len - 1])
        ),
        _ => format!(
            "{}, ... {}",
            authors[..19]
                .iter()
                .map(author_last_initials)
                .collect::<Vec<_>>()
                .join(", "),
            author_last_initials(authors.last().unwrap())
        ),
    }
}

fn apa_reference(reference: &Value) -> String {
    let authors = get_authors(reference);
    let mut parts = vec![
        apa_authors(&authors),
        format!("({}).", get_year(reference)),
        format!("{}.", trim_string(reference.get("title"))),
    ];
    let container_title = trim_string(reference.get("source"));
    if !container_title.is_empty() {
        parts.push(format!("{},", italicize(&container_title)));
        let volume = trim_string(reference.get("volume"));
        let issue = trim_string(reference.get("issue"));
        let pages = trim_string(reference.get("pages"));
        if !volume.is_empty() || !issue.is_empty() {
            parts.push(format!(
                "{}{}{}.",
                if volume.is_empty() {
                    String::new()
                } else {
                    italicize(&volume)
                },
                if issue.is_empty() {
                    String::new()
                } else {
                    format!("({issue})")
                },
                if pages.is_empty() {
                    String::new()
                } else {
                    format!(", {pages}")
                }
            ));
        } else if !pages.is_empty() {
            parts.push(format!("{pages}."));
        }
    }
    let identifier = trim_string(reference.get("identifier"));
    if identifier.starts_with("10.") {
        parts.push(format!("https://doi.org/{identifier}"));
    }
    parts
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

fn apa_inline(reference: &Value) -> String {
    let authors = get_authors(reference);
    let year = get_year(reference);
    match authors.len() {
        0 => format!("({year})"),
        1 => format!("({}, {year})", author_last(&authors[0])),
        2 => format!(
            "({} & {}, {year})",
            author_last(&authors[0]),
            author_last(&authors[1])
        ),
        _ => format!("({} et al., {year})", author_last(&authors[0])),
    }
}

fn chicago_reference(reference: &Value) -> String {
    let authors = get_authors(reference);
    let author_text = match authors.len() {
        0 => String::new(),
        1 => author_last_first(&authors[0]),
        2 => format!(
            "{} and {}",
            author_last_first(&authors[0]),
            author_first_last(&authors[1])
        ),
        3 => format!(
            "{}, {}, and {}",
            author_last_first(&authors[0]),
            author_first_last(&authors[1]),
            author_first_last(&authors[2])
        ),
        _ => format!("{} et al.", author_last_first(&authors[0])),
    };
    let mut parts = vec![
        if author_text.is_empty() {
            String::new()
        } else {
            format!("{author_text}.")
        },
        format!("{}.", get_year(reference)),
        format!("\"{}.\"", trim_string(reference.get("title"))),
    ];
    let container_title = trim_string(reference.get("source"));
    if !container_title.is_empty() {
        parts.push(italicize(&container_title));
        let mut extras = Vec::new();
        let volume = trim_string(reference.get("volume"));
        let issue = trim_string(reference.get("issue"));
        if !volume.is_empty() {
            extras.push(volume);
        }
        if !issue.is_empty() {
            extras.push(format!("no. {issue}"));
        }
        if !extras.is_empty() {
            parts.push(extras.join(", "));
        }
        let pages = trim_string(reference.get("pages"));
        if !pages.is_empty() {
            parts.push(format!(": {pages}."));
        } else {
            parts.push(".".to_string());
        }
    }
    let identifier = trim_string(reference.get("identifier"));
    if identifier.starts_with("10.") {
        parts.push(format!("https://doi.org/{identifier}."));
    }
    parts
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

fn chicago_inline(reference: &Value) -> String {
    let authors = get_authors(reference);
    let year = get_year(reference);
    match authors.len() {
        0 => format!("({year})"),
        1 => format!("({} {year})", author_last(&authors[0])),
        2 => format!(
            "({} and {} {year})",
            author_last(&authors[0]),
            author_last(&authors[1])
        ),
        3 => format!(
            "({}, {}, {} {year})",
            author_last(&authors[0]),
            author_last(&authors[1]),
            author_last(&authors[2]),
        ),
        _ => format!("({} et al. {year})", author_last(&authors[0])),
    }
}

fn ieee_reference(reference: &Value, number: Option<usize>) -> String {
    let authors = get_authors(reference);
    let mut parts = Vec::new();
    if !authors.is_empty() {
        parts.push(
            authors
                .iter()
                .map(|author| {
                    let given = initials(&author.0);
                    if given.is_empty() {
                        author.1.clone()
                    } else {
                        format!("{given} {}", author.1).trim().to_string()
                    }
                })
                .collect::<Vec<_>>()
                .join(", "),
        );
    }
    parts.push(format!("\"{},\"", trim_string(reference.get("title"))));
    let container_title = trim_string(reference.get("source"));
    if !container_title.is_empty() {
        parts.push(format!("{},", italicize(&container_title)));
    }
    let volume = trim_string(reference.get("volume"));
    if !volume.is_empty() {
        parts.push(format!("vol. {volume},"));
    }
    let issue = trim_string(reference.get("issue"));
    if !issue.is_empty() {
        parts.push(format!("no. {issue},"));
    }
    let pages = trim_string(reference.get("pages"));
    if !pages.is_empty() {
        parts.push(format!("pp. {pages},"));
    }
    parts.push(format!("{}.", get_year(reference)));
    let identifier = trim_string(reference.get("identifier"));
    if identifier.starts_with("10.") {
        parts.push(format!("doi: {identifier}."));
    }
    let content = parts
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    if let Some(number) = number {
        format!("[{number}] {content}").trim().to_string()
    } else {
        content.trim().to_string()
    }
}

fn ieee_inline(number: Option<usize>) -> String {
    number
        .map(|value| format!("[{value}]"))
        .unwrap_or_else(|| "[?]".to_string())
}

fn harvard_reference(reference: &Value) -> String {
    let authors = get_authors(reference);
    let author_text = match authors.len() {
        0 => String::new(),
        len if len <= 3 => authors
            .iter()
            .map(author_last_first)
            .collect::<Vec<_>>()
            .join(", "),
        _ => format!("{} et al.", author_last_first(&authors[0])),
    };
    let mut parts = vec![
        author_text,
        format!("({})", get_year(reference)),
        format!("'{}',", trim_string(reference.get("title"))),
    ];
    let container_title = trim_string(reference.get("source"));
    if !container_title.is_empty() {
        parts.push(format!("{},", italicize(&container_title)));
    }
    let volume = trim_string(reference.get("volume"));
    let issue = trim_string(reference.get("issue"));
    if !volume.is_empty() {
        parts.push(format!(
            "{}{},",
            volume,
            if issue.is_empty() {
                String::new()
            } else {
                format!("({issue})")
            }
        ));
    }
    let pages = trim_string(reference.get("pages"));
    if !pages.is_empty() {
        parts.push(format!("pp. {pages}."));
    }
    let identifier = trim_string(reference.get("identifier"));
    if identifier.starts_with("10.") {
        parts.push(format!("doi: {identifier}."));
    }
    parts
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

fn harvard_inline(reference: &Value) -> String {
    apa_inline(reference)
}

fn vancouver_reference(reference: &Value, number: Option<usize>) -> String {
    let authors = get_authors(reference);
    let mut names = authors
        .iter()
        .take(6)
        .map(|author| {
            let given = author
                .0
                .split([' ', '-'])
                .filter(|segment| !segment.is_empty())
                .map(|segment| &segment[..1])
                .collect::<String>();
            format!("{} {}", author.1, given).trim().to_string()
        })
        .collect::<Vec<_>>();
    if authors.len() > 6 {
        names.push("et al".to_string());
    }
    let mut parts = vec![
        if names.is_empty() {
            String::new()
        } else {
            format!("{}.", names.join(", "))
        },
        format!("{}.", trim_string(reference.get("title"))),
    ];
    let container_title = trim_string(reference.get("source"));
    if !container_title.is_empty() {
        parts.push(format!("{container_title}."));
    }
    parts.push(get_year(reference));
    let volume = trim_string(reference.get("volume"));
    let issue = trim_string(reference.get("issue"));
    let pages = trim_string(reference.get("pages"));
    if !volume.is_empty() || !issue.is_empty() || !pages.is_empty() {
        parts.push(format!(
            "{}{}{}.",
            volume,
            if issue.is_empty() {
                String::new()
            } else {
                format!("({issue})")
            },
            if pages.is_empty() {
                String::new()
            } else {
                format!(":{pages}")
            }
        ));
    }
    let identifier = trim_string(reference.get("identifier"));
    if identifier.starts_with("10.") {
        parts.push(format!("doi:{identifier}."));
    }
    let content = parts
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    if let Some(number) = number {
        format!("{number}. {content}").trim().to_string()
    } else {
        content.trim().to_string()
    }
}

fn vancouver_inline(number: Option<usize>) -> String {
    number
        .map(|value| format!("({value})"))
        .unwrap_or_else(|| "(?)".to_string())
}

fn format_reference(style: &str, mode: &str, reference: &Value, number: Option<usize>) -> String {
    match (style, mode) {
        ("apa", "inline") => apa_inline(reference),
        ("apa", _) => apa_reference(reference),
        ("chicago", "inline") => chicago_inline(reference),
        ("chicago", _) => chicago_reference(reference),
        ("ieee", "inline") => ieee_inline(number),
        ("ieee", _) => ieee_reference(reference, number),
        ("harvard", "inline") => harvard_inline(reference),
        ("harvard", _) => harvard_reference(reference),
        ("vancouver", "inline") => vancouver_inline(number),
        ("vancouver", _) => vancouver_reference(reference, number),
        _ => apa_reference(reference),
    }
}

fn candidate_csl_roots(workspace_path: &str) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    let cwd = std::env::current_dir().ok();
    if let Some(cwd) = cwd {
        roots.push(cwd.join("public").join("csl"));
        roots.push(cwd.join("dist").join("csl"));
    }
    let workspace = workspace_path.trim();
    if !workspace.is_empty() {
        roots.push(Path::new(workspace).join("styles"));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            roots.push(parent.join("csl"));
            roots.push(parent.join("public").join("csl"));
            roots.push(parent.join("../Resources/public/csl"));
            roots.push(parent.join("../Resources/csl"));
        }
    }
    roots
}

fn read_csl_style(style_id: &str, workspace_path: &str) -> Result<String, String> {
    for root in candidate_csl_roots(workspace_path) {
        let candidate = root.join(format!("{style_id}.csl"));
        if candidate.exists() {
            return fs::read_to_string(&candidate).map_err(|error| {
                format!("Failed to read CSL style {}: {error}", candidate.display())
            });
        }
    }
    Err(format!("CSL style not found: {style_id}"))
}

fn read_csl_locale(locale: &str, workspace_path: &str) -> Result<String, String> {
    let effective = if locale.trim().is_empty() {
        "en-GB"
    } else {
        locale.trim()
    };
    for root in candidate_csl_roots(workspace_path) {
        let candidate = root.join(format!("locales-{effective}.xml"));
        if candidate.exists() {
            return fs::read_to_string(&candidate).map_err(|error| {
                format!("Failed to read CSL locale {}: {error}", candidate.display())
            });
        }
    }
    Err(format!("CSL locale not found: {effective}"))
}

#[tauri::command]
pub async fn references_citation_format(params: CitationFormatParams) -> Result<String, String> {
    Ok(format_reference(
        params.style.trim(),
        params.mode.trim(),
        &params.reference,
        params.number,
    ))
}

#[tauri::command]
pub async fn references_citation_bibliography(
    params: CitationBibliographyParams,
) -> Result<String, String> {
    Ok(params
        .references
        .iter()
        .enumerate()
        .map(|(index, reference)| {
            format_reference(
                params.style.trim(),
                "bibliography",
                reference,
                Some(index + 1),
            )
        })
        .filter(|entry| !entry.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n"))
}

#[tauri::command]
pub async fn references_citation_format_csl(
    params: CitationCslFormatParams,
) -> Result<String, String> {
    if params.csl_items.is_empty() {
        return Ok(String::new());
    }

    let style_xml = read_csl_style(&params.style_id, &params.workspace_path)?;
    let locale_xml = read_csl_locale(&params.locale, &params.workspace_path)?;
    let style = Style::from_xml(&style_xml)
        .map_err(|error| format!("Failed to parse CSL style: {error}"))?;
    let Style::Independent(style) = style else {
        return Err("Dependent CSL styles are not supported".to_string());
    };
    let locale = LocaleFile::from_xml(&locale_xml)
        .map_err(|error| format!("Failed to parse CSL locale: {error}"))?
        .into();
    let locales = vec![locale];
    let items = params
        .csl_items
        .iter()
        .cloned()
        .map(|item| {
            serde_json::from_value::<hayagriva::citationberg::json::Item>(item)
                .map_err(|error| format!("Failed to parse CSL item: {error}"))
        })
        .collect::<Result<Vec<_>, _>>()?;

    match params.mode.trim() {
        "inline" => {
            let citation_items = items
                .iter()
                .map(CitationItem::with_entry)
                .collect::<Vec<_>>();
            let rendered = hayagriva::standalone_citation(CitationRequest::from_items(
                citation_items,
                &style,
                &locales,
            ));
            let mut output = String::new();
            rendered
                .write_buf(&mut output, BufWriteFormat::Plain)
                .map_err(|error| format!("Failed to render CSL citation: {error}"))?;
            Ok(output.trim().to_string())
        }
        "bibliography" => {
            let mut driver = BibliographyDriver::new();
            for item in &items {
                driver.citation(CitationRequest::from_items(
                    vec![CitationItem::with_entry(item)],
                    &style,
                    &locales,
                ));
            }
            let rendered = driver.finish(BibliographyRequest::new(&style, None, &locales));
            let bibliography = rendered
                .bibliography
                .ok_or_else(|| "CSL bibliography rendering returned no bibliography".to_string())?;
            let mut entries = Vec::new();
            for item in bibliography.items {
                let mut output = String::new();
                item.content
                    .write_buf(&mut output, BufWriteFormat::Plain)
                    .map_err(|error| format!("Failed to render CSL bibliography entry: {error}"))?;
                if !output.trim().is_empty() {
                    entries.push(output.trim().to_string());
                }
            }
            Ok(entries.join("\n\n"))
        }
        _ => {
            let mut driver = BibliographyDriver::new();
            driver.citation(CitationRequest::from_items(
                vec![CitationItem::with_entry(&items[0])],
                &style,
                &locales,
            ));
            let rendered = driver.finish(BibliographyRequest::new(&style, None, &locales));
            let bibliography = rendered
                .bibliography
                .ok_or_else(|| "CSL reference rendering returned no bibliography".to_string())?;
            let first = bibliography
                .items
                .into_iter()
                .next()
                .ok_or_else(|| "CSL reference rendering produced no entries".to_string())?;
            let mut output = String::new();
            first
                .content
                .write_buf(&mut output, BufWriteFormat::Plain)
                .map_err(|error| format!("Failed to render CSL reference entry: {error}"))?;
            Ok(output.trim().to_string())
        }
    }
}
