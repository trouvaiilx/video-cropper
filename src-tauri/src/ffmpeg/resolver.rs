use serde::{Deserialize, Serialize};
use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ToolPaths {
    pub ffmpeg: String,
    pub ffprobe: String,
}

fn candidate(dir: &Path, name: &str) -> Option<PathBuf> {
    let filename = if cfg!(windows) {
        format!("{}.exe", name)
    } else {
        name.to_string()
    };
    let exe = dir.join(filename);
    if exe.is_file() {
        Some(exe)
    } else {
        None
    }
}

pub fn find_tool(name: &str, override_path: Option<&str>) -> Option<String> {
    if let Some(ov) = override_path {
        let p = Path::new(ov);
        if p.is_file() {
            return Some(p.to_string_lossy().to_string());
        }
        if p.is_dir() {
            if let Some(c) = candidate(p, name) {
                return Some(c.to_string_lossy().to_string());
            }
        }
    }

    // 1. Check exe-adjacent bin/
    if let Ok(current_exe) = env::current_exe() {
        if let Some(parent) = current_exe.parent() {
            let bin_dir = parent.join("bin");
            if let Some(c) = candidate(&bin_dir, name) {
                return Some(c.to_string_lossy().to_string());
            }
        }
    }

    // 2. Check repo root / current dir ./bin
    let cwd_bin = PathBuf::from("bin");
    if let Some(c) = candidate(&cwd_bin, name) {
        return Some(c.to_string_lossy().to_string());
    }

    // 3. System PATH via which crate
    if let Ok(found) = which::which(name) {
        return Some(found.to_string_lossy().to_string());
    }

    // 4. Check FFMPEG_HOME / FFPROBE_HOME env vars
    let var_name = format!("{}_HOME", name.to_uppercase());
    if let Ok(env_dir) = env::var(&var_name).or_else(|_| env::var("FFMPEG_HOME")) {
        let p = PathBuf::from(&env_dir);
        if let Some(c) = candidate(&p, name).or_else(|| candidate(&p.join("bin"), name)) {
            return Some(c.to_string_lossy().to_string());
        }
    }

    None
}

pub fn resolve_tools(
    ffmpeg_override: Option<&str>,
    ffprobe_override: Option<&str>,
) -> Option<ToolPaths> {
    let ff = find_tool("ffmpeg", ffmpeg_override)?;
    let fp = find_tool("ffprobe", ffprobe_override)?;
    Some(ToolPaths {
        ffmpeg: ff,
        ffprobe: fp,
    })
}

pub fn tool_version(exe: &str) -> String {
    let mut cmd = Command::new(exe);
    cmd.arg("-version");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    match cmd.output() {
        Ok(out) => {
            let s = String::from_utf8_lossy(&out.stdout);
            s.lines().next().unwrap_or("unknown").trim().to_string()
        }
        Err(_) => "unknown".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_find_tool_returns_something_on_installed_system() {
        // Since ffmpeg is installed on this machine, find_tool should locate it.
        let ff = find_tool("ffmpeg", None);
        assert!(ff.is_some());
    }
}
