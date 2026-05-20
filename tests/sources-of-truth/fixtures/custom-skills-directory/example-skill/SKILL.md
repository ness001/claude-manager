---
name: example-skill
description: Example custom skill used as a sanitized fixture for the custom-skills-directory source-of-truth test. Does not perform any real action — kept minimal to exercise the frontmatter parser and effectiveName resolution.
---

# Example Skill

A minimal SKILL.md body kept for the source-of-truth fixture. The test only
reads the YAML frontmatter and asserts that:

1. The fence delimiters (`---`) are present.
2. `name` and `description` parse out of the flat key/value map.
3. The directory contains exactly one `SKILL.md`.

Real custom skills under `~/.claude/skills/` are typically longer and contain
procedural instructions, code fences, and links to companion files in
`references/`, `scripts/`, and `assets/`. Those are intentionally omitted
here — the fixture only needs to mirror the shape, not the content.
