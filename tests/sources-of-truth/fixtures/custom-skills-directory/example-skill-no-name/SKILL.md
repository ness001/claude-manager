---
description: Example custom skill with no `name` field. Exercises the effectiveName fallback path in src-tauri/src/skills/commands.rs (frontmatter.name absent → use directory name).
---

# Example Skill Without a Name Field

This fixture intentionally omits the `name:` key from its frontmatter so the
test can assert that `effectiveName` falls back to the directory name
(`example-skill-no-name`).

This is a legal shape: the Rust scanner treats `name` as optional and uses
the directory name verbatim when it is missing or empty after trim.
