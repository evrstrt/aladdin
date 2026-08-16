use base64::Engine;
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};

const CONTRACT_README: &str = include_str!("../../../templates/EXPERIMENTS-README.md");
const CLAUDE_SECTION: &str = "\n## experiments \u{2014} aladdin\n\nThis repo tracks experiments under `experiments/`. Before any experiment, test run,\nor pipeline-evaluation work, read `experiments/README.md` and follow its rules.\nUse the aladdin MCP tools: query_experiments before starting; record_run, mark_run,\nsubmit_verdict, conclude_experiment while working; check_tree before ending the\nsession. If the aladdin MCP server is not available, say so and stop recording \u{2014}\ndo not hand-write experiment files. Never edit anything under runs/ except via\nmark_run; never delete or rewrite a verdict \u{2014} supersede it.\n";

fn home() -> PathBuf {
    PathBuf::from(std::env::var("HOME").unwrap_or_default())
}

fn load_repos() -> Vec<PathBuf> {
    let Ok(text) = fs::read_to_string(home().join(".aladdin/repos.json")) else {
        return vec![];
    };
    serde_json::from_str::<Value>(&text)
        .ok()
        .and_then(|v| serde_json::from_value::<Vec<String>>(v.get("repos")?.clone()).ok())
        .map(|v| v.into_iter().map(PathBuf::from).collect())
        .unwrap_or_default()
}

fn parse_fm(text: &str) -> Option<(Value, String)> {
    let rest = text.strip_prefix("---\n")?;
    let end = rest.find("\n---")?;
    let yaml: serde_yaml::Value = serde_yaml::from_str(&rest[..end]).ok()?;
    let body = rest[end + 4..].trim_start_matches('\n').to_string();
    Some((serde_json::to_value(yaml).ok()?, body))
}

fn read_md(p: &Path) -> Value {
    match fs::read_to_string(p).ok().and_then(|t| parse_fm(&t)) {
        Some((data, body)) => json!({ "data": data, "body": body }),
        None => json!({ "_error": "unreadable or missing frontmatter" }),
    }
}

fn read_json_file(p: &Path) -> Value {
    fs::read_to_string(p)
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_else(|| json!({ "_error": "unreadable" }))
}

fn sorted_dirs(parent: &Path, pattern: &str) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(parent) else {
        return vec![];
    };
    let mut dirs: Vec<PathBuf> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.is_dir()
                && p.file_name()
                    .and_then(|n| n.to_str())
                    .map(|n| n.starts_with(pattern))
                    .unwrap_or(false)
        })
        .collect();
    dirs.sort();
    dirs
}

#[tauri::command]
fn get_state() -> Value {
    let mut projects = vec![];
    for repo in load_repos() {
        let root = repo.join("experiments");
        let mut experiments = vec![];
        if root.is_dir() {
            for dir in sorted_dirs(&root, "exp-") {
                let exp = read_md(&dir.join("experiment.md"));
                let runs: Vec<Value> = sorted_dirs(&dir.join("runs"), "run-")
                    .iter()
                    .map(|rd| {
                        let evidence_dir = rd.join("evidence");
                        let mut evidence: Vec<String> = fs::read_dir(&evidence_dir)
                            .map(|es| {
                                es.flatten()
                                    .map(|e| e.path().to_string_lossy().into_owned())
                                    .filter(|p| !Path::new(p).file_name().unwrap_or_default().to_string_lossy().starts_with('.'))
                                    .collect()
                            })
                            .unwrap_or_default();
                        evidence.sort();
                        let status_p = rd.join("status.json");
                        let metrics_p = rd.join("metrics.json");
                        json!({
                            "id": rd.file_name().unwrap_or_default().to_string_lossy(),
                            "run": read_json_file(&rd.join("run.json")),
                            "status": if status_p.exists() { read_json_file(&status_p) } else { Value::Null },
                            "metrics": if metrics_p.exists() { read_json_file(&metrics_p) } else { Value::Null },
                            "evidence": evidence,
                        })
                    })
                    .collect();
                let verdicts_dir = dir.join("verdicts");
                let mut verdict_files: Vec<PathBuf> = fs::read_dir(&verdicts_dir)
                    .map(|es| {
                        es.flatten()
                            .map(|e| e.path())
                            .filter(|p| {
                                p.file_name()
                                    .and_then(|n| n.to_str())
                                    .map(|n| n.starts_with("v-") && n.ends_with(".md"))
                                    .unwrap_or(false)
                            })
                            .collect()
                    })
                    .unwrap_or_default();
                verdict_files.sort();
                let verdicts: Vec<Value> = verdict_files
                    .iter()
                    .map(|f| {
                        let mut v = read_md(f);
                        v["file"] = json!(f.to_string_lossy());
                        v
                    })
                    .collect();
                let unreviewed = verdicts
                    .iter()
                    .filter(|v| v["data"]["status"] == "unreviewed")
                    .count();
                experiments.push(json!({
                    "dir": dir.to_string_lossy(),
                    "name": dir.file_name().unwrap_or_default().to_string_lossy(),
                    "exp": exp,
                    "runs": runs,
                    "verdicts": verdicts,
                    "unreviewed": unreviewed,
                }));
            }
        }
        projects.push(json!({
            "name": repo.file_name().unwrap_or_default().to_string_lossy(),
            "path": repo.to_string_lossy(),
            "missing": !root.is_dir(),
            "experiments": experiments,
        }));
    }
    json!({ "projects": projects, "reviewer": std::env::var("USER").unwrap_or_default() })
}

fn allowed(p: &Path) -> bool {
    load_repos().iter().any(|r| {
        r.join("experiments")
            .canonicalize()
            .map(|root| p.starts_with(root))
            .unwrap_or(false)
    })
}

#[tauri::command]
fn read_evidence(path: String) -> Result<Value, String> {
    let canon = PathBuf::from(&path).canonicalize().map_err(|e| e.to_string())?;
    if !allowed(&canon) {
        return Err("outside registered repos".into());
    }
    let ext = canon
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "mp4" => "video/mp4",
        "json" => "application/json",
        _ => "text/plain",
    };
    if mime.starts_with("text") || mime == "application/json" {
        let text = fs::read_to_string(&canon).map_err(|e| e.to_string())?;
        return Ok(json!({ "kind": "text", "ext": ext, "text": text }));
    }
    let bytes = fs::read(&canon).map_err(|e| e.to_string())?;
    Ok(json!({
        "kind": "binary",
        "mime": mime,
        "base64": base64::engine::general_purpose::STANDARD.encode(bytes),
    }))
}

#[tauri::command]
fn review_verdict(file: String, action: String) -> Result<Value, String> {
    if action != "confirm" && action != "reject" {
        return Err("action must be confirm or reject".into());
    }
    let canon = PathBuf::from(&file).canonicalize().map_err(|e| e.to_string())?;
    let name = canon.file_name().and_then(|n| n.to_str()).unwrap_or("");
    let in_verdicts = canon
        .parent()
        .and_then(|p| p.file_name())
        .map(|n| n == "verdicts")
        .unwrap_or(false);
    if !allowed(&canon) || !in_verdicts || !name.starts_with("v-") || !name.ends_with(".md") {
        return Err("not a verdict file inside a registered repo".into());
    }
    let text = fs::read_to_string(&canon).map_err(|e| e.to_string())?;
    let rest = text.strip_prefix("---\n").ok_or("missing frontmatter")?;
    let end = rest.find("\n---").ok_or("unterminated frontmatter")?;
    let mut data: serde_yaml::Mapping =
        serde_yaml::from_str(&rest[..end]).map_err(|e| e.to_string())?;
    let body = rest[end + 4..].trim_start_matches('\n').to_string();
    if data.get("status").and_then(|s| s.as_str()) != Some("unreviewed") {
        return Err("verdict is not unreviewed".into());
    }
    let status = if action == "confirm" { "confirmed" } else { "rejected" };
    data.insert("status".into(), status.into());
    data.insert(
        "reviewed_by".into(),
        std::env::var("USER").unwrap_or_default().into(),
    );
    let yaml = serde_yaml::to_string(&data).map_err(|e| e.to_string())?;
    fs::write(&canon, format!("---\n{yaml}---\n\n{body}")).map_err(|e| e.to_string())?;
    serde_json::to_value(&data).map_err(|e| e.to_string())
}


#[tauri::command]
fn add_project(path: String) -> Result<Value, String> {
    let dir = PathBuf::from(&path);
    if !dir.is_dir() {
        return Err("not a folder".into());
    }
    let root = dir.join("experiments");
    let mut created = false;
    if !root.is_dir() {
        fs::create_dir_all(root.join("scoring")).map_err(|e| e.to_string())?;
        fs::write(root.join("README.md"), CONTRACT_README).map_err(|e| e.to_string())?;
        fs::write(
            root.join("INDEX.md"),
            "# experiments\n\n(no experiments yet)\n",
        )
        .map_err(|e| e.to_string())?;
        created = true;
    }
    let claude_md = dir.join("CLAUDE.md");
    if claude_md.exists() {
        let text = fs::read_to_string(&claude_md).map_err(|e| e.to_string())?;
        if !text.contains("aladdin") {
            fs::write(&claude_md, format!("{text}{CLAUDE_SECTION}")).map_err(|e| e.to_string())?;
        }
    } else {
        fs::write(&claude_md, format!("# CLAUDE.md\n{CLAUDE_SECTION}")).map_err(|e| e.to_string())?;
    }
    let cfg_dir = home().join(".aladdin");
    fs::create_dir_all(&cfg_dir).map_err(|e| e.to_string())?;
    let mut repos: Vec<String> = load_repos()
        .iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect();
    let abs = dir.to_string_lossy().into_owned();
    if !repos.contains(&abs) {
        repos.push(abs.clone());
    }
    fs::write(
        cfg_dir.join("repos.json"),
        serde_json::to_string_pretty(&json!({ "repos": repos })).map_err(|e| e.to_string())? + "\n",
    )
    .map_err(|e| e.to_string())?;
    Ok(json!({ "path": abs, "scaffolded": created }))
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![get_state, read_evidence, review_verdict, add_project])
        .run(tauri::generate_context!())
        .expect("error while running aladdin");
}
