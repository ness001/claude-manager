// Custom-skills list page — see spec §7.1, §17.6 (empty state), §17.7 (search).
// Header: "Custom Skills" title + skill count + path + [+ Create Skill] +
// search bar. Body: list of SkillCards. Info box at the bottom links the
// reader to the Plugins panel for plugin-bundled skills.

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { open as openShell } from "@tauri-apps/plugin-shell";
import { homeDir, join } from "@tauri-apps/api/path";

import { filterSkills, useSkillStore } from "../../stores/skill-store";
import { useNavigationStore } from "../../stores/navigation-store";
import { SkillCard } from "./SkillCard";

// Display-only path for header/empty-state copy. Filesystem operations must
// resolve $HOME first — `openShell` doesn't expand `~`.
const SKILLS_PATH = "~/.claude/skills/";

export function SkillsListView() {
  const skills = useSkillStore((s) => s.skills);
  const searchQuery = useSkillStore((s) => s.searchQuery);
  const setSearchQuery = useSkillStore((s) => s.setSearchQuery);
  const isLoading = useSkillStore((s) => s.isLoading);
  const navigateTo = useNavigationStore((s) => s.navigateTo);

  // Inline error surface for the Create Skill button. openShell rejects when
  // the directory is missing, the Tauri shell allowlist denies, or no OS file
  // browser handler is registered — without an inline alert the button
  // appears to do nothing on click. Mirrors SkillCard (skill-open-error) and
  // PluginDetailView (plugin-open-error, PR #168).
  const [createError, setCreateError] = useState<string | null>(null);

  const filtered = useMemo(
    () => filterSkills(skills, searchQuery),
    [skills, searchQuery],
  );

  const onCreateSkill = async () => {
    // Per spec §7.1: "[+ Create Skill] button (opens file browser to create
    // directory)". Best-effort open of the skills root; user creates the
    // subdirectory + SKILL.md themselves. `openShell` does NOT expand `~`,
    // so resolve $HOME first.
    setCreateError(null);
    try {
      const home = await homeDir();
      const abs = await join(home, ".claude", "skills");
      await openShell(abs);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section
      data-testid="skill-list-view"
      className="flex h-full flex-col gap-4 p-6"
    >
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-text-primary">
            Custom Skills
          </h1>
          <button
            type="button"
            data-testid="create-skill-btn"
            onClick={() => {
              void onCreateSkill();
            }}
            className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Plus size={14} aria-hidden="true" />
            Create Skill
          </button>
        </div>
        {/* WCAG 1.3.1 / 4.1.2: the count + path pair was rendered as flat
            sibling spans inside a non-semantic <div> — invisible to SR
            list-rotor (NVDA "L", JAWS "L", VoiceOver rotor → Lists) and
            each value was opaque ("5 skills" / a bare path with no role
            cue). Promote to <ul aria-label="Skill counts"> with one <li>
            per stat plus per-<li> aria-labels so the rotor surfaces
            "list, 2 items, Skill counts" and each item self-describes
            ("Skills: 5", "Skills directory: …"). Visible flex layout
            unchanged. Mirrors PR #254 (PluginListView stats), PR #235
            (SkillsListView grid → labeled <ul>), PR #230 (SystemHealth). */}
        <ul
          data-testid="skills-stats-list"
          aria-label="Skill counts"
          className="flex gap-3 text-xs text-text-muted"
        >
          {/* Pluralize so SR + sighted users don't see "1 skills". Mirrors
            * PR #87 (SessionCard), PR #90 (SystemHealth), PR #133
            * (RecentSessions), PR #219 (PluginCard counts). */}
          <li
            data-testid="stat-skill-count"
            aria-label={`Skills: ${skills.length}`}
          >
            {skills.length} {skills.length === 1 ? "skill" : "skills"}
          </li>
          <li aria-label={`Skills directory: ${SKILLS_PATH}`}>
            <code
              data-testid="stat-skills-path"
              className="rounded bg-bg-tertiary px-1.5 py-0.5"
            >
              {SKILLS_PATH}
            </code>
          </li>
        </ul>
        {createError !== null && (
          <p
            data-testid="skill-create-error"
            role="alert"
            className="text-xs text-status-red"
          >
            Couldn't open skills directory: {createError}
          </p>
        )}
        <div className="relative">
          <Search
            size={14}
            aria-hidden="true"
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="search"
            data-testid="skill-search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              // WebView2 (Tauri's webview) does not consistently honor the
              // <input type=search> browser-default Escape-to-clear behavior,
              // and even when it does, focus jumps off the input — the user
              // has to click back into the field before they can type a new
              // query. Wire an explicit Escape handler so the field clears
              // and stays focused. Mirrors PRs #151 (McpPanel), #152
              // (PluginListView), #153 (SessionSearch).
              if (e.key === "Escape" && searchQuery !== "") {
                e.preventDefault();
                setSearchQuery("");
              }
            }}
            placeholder="Search skills by name or description…"
            aria-label="Search skills"
            className="w-full rounded-md border border-border bg-bg-tertiary py-1.5 pl-7 pr-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </div>
      </header>

      {isLoading && skills.length === 0 ? (
        // WCAG 4.1.3 (Status Messages): the pulsing rectangles convey
        // "loading in progress" purely visually — screen readers see only
        // empty <div>s. Mirrors PR #202 (McpPanel skeleton) + PR #203
        // (PluginListView skeleton). aria-busy tells AT the region is
        // being updated; the visually-hidden role="status" announces
        // "Loading skills…" once; aria-hidden on the placeholders keeps
        // SR users from traversing empty graphics.
        <div
          data-testid="loading-skeleton"
          aria-busy="true"
          className="flex flex-col gap-2"
        >
          <span role="status" aria-live="polite" className="sr-only">
            Loading skills…
          </span>
          <div aria-hidden="true" className="h-20 animate-pulse rounded-md bg-bg-tertiary" />
          <div aria-hidden="true" className="h-20 animate-pulse rounded-md bg-bg-tertiary" />
        </div>
      ) : skills.length === 0 ? (
        <div
          data-testid="empty-state"
          role="status"
          aria-live="polite"
          className="flex flex-1 items-center justify-center text-center text-sm text-text-muted"
        >
          No custom skills found at{" "}
          <code className="mx-1 rounded bg-bg-tertiary px-1.5 py-0.5">
            ~/.claude/skills/
          </code>
          . Create a skill directory with a SKILL.md file to get started.
        </div>
      ) : filtered.length === 0 ? (
        <div
          data-testid="no-matches"
          role="status"
          aria-live="polite"
          className="flex flex-1 items-center justify-center text-center text-sm text-text-muted"
        >
          No results for "{searchQuery}"
        </div>
      ) : (
        // WCAG 1.3.1 (Info and Relationships): the cards form a list of N
        // skills semantically, but were previously emitted as a flat
        // <div><div/></div> sequence — SR users navigating by lists (NVDA
        // "L", JAWS "L", VoiceOver rotor → Lists) heard nothing for this
        // collection and the count ("list, N items") was lost. Promote the
        // container to a labeled <ul> so AT can land on it via the rotor
        // and announce the count. Mirrors ModelDonut's donut-legend
        // (PR #117 / aria-label "Model usage breakdown") and SystemHealth's
        // indicator list (PR #230 / "System health indicators").
        <ul
          data-testid="skill-grid"
          aria-label="Custom skills"
          className="flex flex-col gap-2 overflow-auto"
        >
          {filtered.map((s) => (
            <li key={s.dirPath}>
              <SkillCard skill={s} />
            </li>
          ))}
        </ul>
      )}

      <aside
        data-testid="plugins-info-box"
        className="rounded-md border border-border bg-bg-tertiary px-3 py-2 text-xs text-text-secondary"
      >
        These are <strong>custom skills</strong> in{" "}
        <code className="rounded bg-bg-secondary px-1">~/.claude/skills/</code>.
        Plugin-bundled skills (shipped inside a plugin) are listed in the{" "}
        <button
          type="button"
          data-testid="plugins-panel-link"
          onClick={() => navigateTo("plugins")}
          className="rounded underline hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Plugins panel
        </button>
        .
      </aside>
    </section>
  );
}
