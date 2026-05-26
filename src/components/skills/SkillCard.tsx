// Custom-skill row for the list view — see spec §7.1.
// 📝 icon, name, description, file path (skillMdPath), actions
// (Open in VS Code, Open in File Browser).

import { useState } from "react";
import { FileText, FolderOpen, Code2 } from "lucide-react";
import { open as openShell } from "@tauri-apps/plugin-shell";

import type { CustomSkill } from "../../lib/skill-types";

interface SkillCardProps {
  skill: CustomSkill;
}

export function SkillCard({ skill }: SkillCardProps) {
  // Surface failures inline. `openShell` rejects when the target doesn't
  // exist (deleted directory), the OS has no handler for the URI scheme
  // (VS Code not installed → vscode:// has no registered handler), or the
  // Tauri shell allowlist forbids the path. Without this, the user clicks
  // the button and gets nothing — same silent-failure class as PR #91.
  const [openError, setOpenError] = useState<string | null>(null);

  const openInFileBrowser = async () => {
    setOpenError(null);
    try {
      await openShell(skill.dirPath);
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : String(err));
    }
  };
  const openInVsCode = async () => {
    setOpenError(null);
    try {
      // The vscode://file/ URI scheme is RFC 3986; Windows paths like
      // "C:\Users\..." must use forward slashes, otherwise VS Code's URI
      // handler rejects them and the open silently no-ops.
      const uriPath = skill.skillMdPath.replace(/\\/g, "/");
      await openShell(`vscode://file/${uriPath}`);
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div
      data-testid="skill-card"
      data-skill-name={skill.name}
      className="flex flex-col gap-2 rounded-md border border-border bg-card-bg p-3 shadow-card transition-shadow hover:bg-bg-tertiary hover:shadow-card-hover"
    >
      <div className="flex items-center gap-2">
        <FileText
          aria-hidden="true"
          size={14}
          className="shrink-0 text-text-muted"
        />
        <span
          className="truncate text-sm font-medium text-text-primary"
          title={skill.name}
        >
          {skill.name}
        </span>
      </div>
      {skill.description && (
        <p data-testid="skill-description" className="text-xs text-text-secondary">{skill.description}</p>
      )}
      <code
        data-testid="skill-path"
        // Path strings (e.g. C:\Users\…\.claude\skills\my-skill\skill.md)
        // routinely overflow a card width and get clipped by `truncate`
        // (text-overflow: ellipsis). Without a tooltip there's no way for
        // a sighted user to recover the hidden tail — they'd have to open
        // the file in VS Code or the file browser just to read where it
        // lives. Mirror the visible string into `title` so hover / long-
        // press surfaces the full path (and AT users continue to get the
        // full string from the element's text content).
        title={skill.skillMdPath}
        className="truncate rounded bg-bg-tertiary px-1.5 py-0.5 text-[11px] text-text-muted"
      >
        {skill.skillMdPath}
      </code>
      {/* WAI-ARIA Toolbar pattern: the Open-in-VS-Code + Open-in-File-Browser
        * pair is a related control group operating on the same skill. Without
        * role="toolbar" + a skill-scoped accessible name, SR users navigating
        * a list of skills hear identical "Open in VS Code, button … Open in
        * File Browser, button" pairs with no way to tell which skill each
        * pair belongs to. Embedding skill.name in the toolbar label gives
        * unique landmark names per card. Mirrors PR #246 (SessionInfoBar),
        * PR #248 (McpServerCard), and PR #249 (PluginCard broken-state
        * recovery actions). */}
      <div
        role="toolbar"
        aria-label={`Actions for ${skill.name}`}
        data-testid="skill-actions-toolbar"
        className="flex gap-2"
      >
        <button
          type="button"
          data-testid="open-vscode-btn"
          onClick={() => {
            void openInVsCode();
          }}
          className="flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] text-text-secondary hover:bg-bg-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Code2 size={12} aria-hidden="true" />
          Open in VS Code
        </button>
        <button
          type="button"
          data-testid="open-folder-btn"
          onClick={() => {
            void openInFileBrowser();
          }}
          className="flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] text-text-secondary hover:bg-bg-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <FolderOpen size={12} aria-hidden="true" />
          Open in File Browser
        </button>
      </div>
      {openError !== null && (
        <p
          data-testid="skill-open-error"
          role="alert"
          className="text-[11px] text-status-red"
        >
          Couldn't open: {openError}
        </p>
      )}
    </div>
  );
}
