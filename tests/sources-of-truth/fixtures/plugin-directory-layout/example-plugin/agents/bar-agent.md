---
name: bar-agent
description: "Synthetic agent for the plugin-directory-layout fixture. Exercises the optional tools/model/color frontmatter fields documented in plugin-types.ts (AgentInfo)."
tools: [Read, Bash, Grep]
model: inherit
color: blue
---

You are a synthetic example agent. The fixture test parses the YAML
frontmatter above and asserts that the optional `tools`, `model`, and `color`
fields are present and shaped as documented.
