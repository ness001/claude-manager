// Custom-skill row for the list view — see spec §7.1.
// 📝 icon, name, description, file path (skillMdPath), actions
// (Open in VS Code, Open in File Browser).

import { FileText, FolderOpen, Code2 } from "lucide-react";
import { open as openShell } from "@tauri-apps/plugin-shell";

import type { CustomSkill } from "../../lib/skill-types";

interface SkillCardProps {
  skill: CustomSkill;
}

export function SkillCard({ skill }: SkillCardProps) {
  const openInFileBrowser = async () => {
    try {
      await openShell(skill.dirPath);
    } catch (err) {
      console.error("Failed to open skill directory:", err);
    }
  };
  const openInVsCode = async () => {
    try {
      await openShell(`vscode://file/${skill.skillMdPath}`);
    } catch (err) {
      console.error("Failed to open SKILL.md in VS Code:", err);
    }
  };

  return (
    <div
      data-testid="skill-card"
      data-skill-name={skill.name}
      className="flex flex-col gap-2 rounded-md border border-border bg-card-bg p-3 hover:bg-bg-tertiary"
    >
      <div className="flex items-center gap-2">
        <FileText
          aria-hidden="true"
          size={14}
          className="shrink-0 text-text-muted"
        />
        <span className="truncate text-sm font-medium text-text-primary">
          {skill.name}
        </span>
      </div>
      <p className="text-xs text-text-secondary">{skill.description}</p>
      <code
        data-testid="skill-path"
        className="truncate rounded bg-bg-tertiary px-1.5 py-0.5 text-[11px] text-text-muted"
      >
        {skill.skillMdPath}
      </code>
      <div className="flex gap-2">
        <button
          type="button"
          data-testid="open-vscode-btn"
          onClick={() => {
            void openInVsCode();
          }}
          className="flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] text-text-secondary hover:bg-bg-tertiary"
        >
          <Code2 size={12} />
          Open in VS Code
        </button>
        <button
          type="button"
          data-testid="open-folder-btn"
          onClick={() => {
            void openInFileBrowser();
          }}
          className="flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] text-text-secondary hover:bg-bg-tertiary"
        >
          <FolderOpen size={12} />
          Open in File Browser
        </button>
      </div>
    </div>
  );
}
