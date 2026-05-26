// MCP Add/Edit form modal — see spec §17.10.
//
// Fields: Name (text, required, alphanumeric + hyphens, unique within scope),
// Scope (radio: User/Local), Type (radio: stdio/sse/http; swaps fields below),
// Command (stdio, required), Args (stdio, tag-style multi-input),
// URL (sse/http, required, valid URL), Headers (sse/http, key-value, supports
// `${ENV_VAR}`), Env (key-value, all types).
//
// Save calls saveMcpServer via the parent's onSave; Cancel closes without
// touching disk.

import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { saveMcpServer } from "../../lib/mcp-loader";
import type {
  McpScope,
  McpServer,
  McpServerType,
} from "../../lib/mcp-types";

interface McpServerFormProps {
  initial?: McpServer | null;
  /** Server names in scope at time of opening, used for uniqueness check.
   *  Maps scope → set of names. The current `initial.name` is excluded
   *  from the set so editing keeps the same name. */
  existingNames: Record<McpScope, string[]>;
  cwd: string;
  onClose: () => void;
  onSaved: () => void;
}

const NAME_RE = /^[A-Za-z0-9-]+$/;

export function McpServerForm({
  initial,
  existingNames,
  cwd,
  onClose,
  onSaved,
}: McpServerFormProps) {
  const isEdit = initial !== null && initial !== undefined;
  const titleId = useId();
  // Per-field input ids so the visible <label> can wire `htmlFor` to the
  // corresponding <input id={…}>. Without this, clicking the visible "Name"
  // / "Command" / "URL" label text did nothing — sighted users lost the
  // standard click-the-label-to-focus-the-input behavior, and accessibility
  // linters flag the orphan <label> (no `for`, no implicit wrap) as a
  // missing label association. The inputs already carry an explicit
  // aria-label so SR users had the right accessible name; this fixes the
  // sighted-user click affordance and removes the orphan-label warning.
  const nameInputId = useId();
  const commandInputId = useId();
  const urlInputId = useId();
  const [name, setName] = useState(initial?.name ?? "");
  const [scope, setScope] = useState<McpScope>(
    initial?.scope === "local" ? "local" : "user",
  );
  const [type, setType] = useState<McpServerType>(initial?.type ?? "stdio");
  const [command, setCommand] = useState(initial?.command ?? "");
  const [args, setArgs] = useState<string[]>(initial?.args ?? []);
  const [argDraft, setArgDraft] = useState("");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [headers, setHeaders] = useState<[string, string][]>(
    Object.entries(initial?.headers ?? {}),
  );
  const [env, setEnv] = useState<[string, string][]>(
    Object.entries(initial?.env ?? {}),
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Esc closes the modal — standard a11y pattern for `role="dialog"`. Backdrop
  // click already dismisses; keyboard users got nothing until now.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // WAI-ARIA APG modal-dialog pattern: when a modal opens, focus must move
  // into it (otherwise focus stays on the trigger button outside the
  // dialog, and keyboard/SR users have to manually click into it before
  // typing). Name is the first required field — a sensible default.
  //
  // The unmount cleanup completes the round-trip: WAI-ARIA APG modal pattern
  // requires that closing the dialog returns focus to the element that opened
  // it (WCAG 2.4.3 Focus Order). Without this, keyboard / SR users were
  // dumped at <body> when the modal closed — they'd Tab from the start of the
  // page to find the trigger again. Capture the previously-focused element
  // on mount, restore it on unmount.
  const nameRef = useRef<HTMLInputElement | null>(null);
  // Focus-trap container ref. The dialog has `aria-modal="true"` (line ~164)
  // but without a Tab/Shift+Tab interceptor, keyboard users can Tab past the
  // last focusable element and land on background controls (the McpPanel
  // toolbar buttons, the search field, the cards underneath) — which are
  // visually obscured by the backdrop but still in the document focus order.
  // WAI-ARIA APG modal-dialog pattern + WCAG 2.4.3 (Focus Order) requires
  // focus to cycle within the modal until it's dismissed. Mirrors the same
  // gap closed for native browser <dialog> via showModal()'s built-in trap.
  const formRef = useRef<HTMLFormElement | null>(null);
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    nameRef.current?.focus();
    return () => {
      // Guard: the trigger may have been removed from the DOM while the
      // modal was open (e.g., scope changed). `focus()` on a detached node
      // is a no-op in browsers but throws in jsdom — check connectedness.
      if (previouslyFocused && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, []);

  const nameError = useMemo(() => {
    const trimmed = name.trim();
    if (trimmed === "") return "Name is required";
    if (!NAME_RE.test(trimmed)) return "Alphanumeric + hyphens only";
    const taken = new Set(existingNames[scope] ?? []);
    if (isEdit && initial?.scope === scope) taken.delete(initial.name);
    if (taken.has(trimmed)) return "Name must be unique within scope";
    return null;
  }, [name, scope, existingNames, isEdit, initial]);

  const urlError = useMemo(() => {
    if (type === "stdio") return null;
    const trimmed = url.trim();
    if (trimmed === "") return "URL is required";
    try {
      new URL(trimmed);
    } catch {
      return "Must be a valid URL";
    }
    return null;
  }, [type, url]);

  const commandError =
    type === "stdio" && command.trim() === "" ? "Command is required" : null;

  const canSubmit =
    !nameError && !commandError && !urlError && !submitting;

  const onAddArg = () => {
    if (argDraft.trim() === "") return;
    setArgs((a) => [...a, argDraft.trim()]);
    setArgDraft("");
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    const server: McpServer = {
      name: name.trim(),
      type,
      scope,
      status: initial?.status ?? "disconnected",
      env: Object.fromEntries(env),
      isOverridden: false,
    };
    if (type === "stdio") {
      server.command = command.trim();
      server.args = args;
    } else {
      server.url = url.trim();
      server.headers = Object.fromEntries(headers);
    }
    try {
      await saveMcpServer(server, { cwd });
      onSaved();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      data-testid="mcp-form-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <form
        data-testid="mcp-form"
        ref={formRef}
        // Focus trap: cycle Tab / Shift+Tab among focusable descendants of
        // the form so the modal honors WAI-ARIA APG (focus must not escape
        // a modal). Query the focusable set on each Tab press because
        // controls appear/disappear with type/scope changes and
        // disabled-state transitions; caching would go stale. The selector
        // matches the standard tabbable set (form fields + buttons +
        // links + tabIndex-augmented elements), filters out disabled and
        // tabindex="-1" entries.
        onKeyDown={(e) => {
          if (e.key !== "Tab") return;
          const root = formRef.current;
          if (!root) return;
          const tabbables = Array.from(
            root.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          ).filter((el) => el.tabIndex !== -1);
          if (tabbables.length === 0) return;
          const first = tabbables[0];
          const last = tabbables[tabbables.length - 1];
          const active = document.activeElement as HTMLElement | null;
          if (e.shiftKey) {
            if (active === first || !root.contains(active)) {
              e.preventDefault();
              last.focus();
            }
          } else {
            if (active === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
        // Wrapping the field stack in a real <form> + Enter-key default-submit
        // gives keyboard users the universally-expected "type, press Enter to
        // save" behavior — the previous <div> swallowed Enter silently and
        // forced everyone to mouse over to the Save button. The arg input
        // (line ~262) already calls e.preventDefault() inside its own
        // onKeyDown when adding an arg, which by browser default also
        // prevents the implicit form submission — so adding an arg with
        // Enter still does NOT save the form. Browsers also natively skip
        // implicit submission while an IME composition is active (CJK input
        // method commit-Enter), so no extra isComposing guard is needed.
        // Mirrors PR #288 (session-name Esc-to-revert), the dialog's
        // existing Esc-to-close handler (line 61), and standard form UX.
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit && !submitting) void handleSubmit();
        }}
        className="flex max-h-[90vh] w-[500px] flex-col gap-3 overflow-auto rounded-md border border-border bg-card-bg p-4 shadow-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-base font-semibold text-text-primary">
          {isEdit ? "Edit MCP Server" : "Add MCP Server"}
        </h2>

        <Field label="Name" htmlFor={nameInputId} error={nameError}>
          <input
            data-testid="form-name"
            id={nameInputId}
            type="text"
            ref={nameRef}
            aria-label="Server name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </Field>

        <Field label="Scope">
          {/* WAI-ARIA Radio Group pattern: a set of radios that share a `name`
            * attribute is functionally a radiogroup at the form level, but
            * without role="radiogroup" + an accessible group name, screen-
            * reader users hear two/three orphan radios with no announcement
            * of what the *group* represents. The visible "Scope" label sits
            * in a sibling <label> that has no `htmlFor` so it doesn't
            * programmatically associate with anything — the group has no
            * accessible name at all. Wrap with role="radiogroup" + an inline
            * aria-label so SR rotor announces "Scope, radio group" and the
            * APG-required keyboard arrow-key roving works under the right
            * semantic primitive. Mirrors the Type group below. */}
          <div role="radiogroup" aria-label="Scope" className="flex gap-3 text-sm">
            {(["user", "local"] as const).map((s) => (
              <label key={s} className="flex items-center gap-1">
                <input
                  data-testid={`form-scope-${s}`}
                  type="radio"
                  name="scope"
                  checked={scope === s}
                  onChange={() => setScope(s)}
                />
                {s}
              </label>
            ))}
          </div>
        </Field>

        <Field label="Type">
          <div role="radiogroup" aria-label="Type" className="flex gap-3 text-sm">
            {(["stdio", "sse", "http"] as const).map((t) => (
              <label key={t} className="flex items-center gap-1">
                <input
                  data-testid={`form-type-${t}`}
                  type="radio"
                  name="type"
                  checked={type === t}
                  onChange={() => setType(t)}
                />
                {t}
              </label>
            ))}
          </div>
        </Field>

        {type === "stdio" ? (
          <>
            <Field label="Command" htmlFor={commandInputId} error={commandError}>
              <input
                data-testid="form-command"
                id={commandInputId}
                type="text"
                aria-label="Command"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                className="w-full rounded border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </Field>
            <Field label="Args">
              <div className="flex flex-wrap gap-1">
                {args.map((a, i) => (
                  <span
                    key={`${a}-${i}`}
                    data-testid="form-arg-tag"
                    className="flex items-center gap-1 rounded bg-bg-tertiary px-1.5 py-0.5 text-xs text-text-secondary"
                  >
                    {a}
                    <button
                      type="button"
                      data-testid={`form-arg-remove-${i}`}
                      aria-label={`Remove ${a}`}
                      onClick={() => setArgs((xs) => xs.filter((_, j) => j !== i))}
                      className="rounded-sm text-text-muted hover:text-status-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  data-testid="form-arg-input"
                  type="text"
                  value={argDraft}
                  onChange={(e) => setArgDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onAddArg();
                    }
                  }}
                  placeholder="add arg + Enter"
                  aria-label="Add command argument"
                  className="flex-1 rounded border border-border bg-bg-tertiary px-2 py-1 text-xs text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                />
              </div>
            </Field>
          </>
        ) : (
          <>
            <Field label="URL" htmlFor={urlInputId} error={urlError}>
              <input
                data-testid="form-url"
                id={urlInputId}
                type="text"
                aria-label="URL"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full rounded border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </Field>
            <Field label="Headers">
              <KeyValueEditor
                entries={headers}
                onChange={setHeaders}
                testidPrefix="form-header"
                fieldLabel="HTTP header"
              />
            </Field>
          </>
        )}

        <Field label="Env">
          <KeyValueEditor
            entries={env}
            onChange={setEnv}
            testidPrefix="form-env"
            fieldLabel="Environment variable"
          />
        </Field>

        {submitError && (
          <p
            data-testid="form-error"
            role="alert"
            className="text-xs text-status-error"
          >
            {submitError}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            data-testid="form-cancel"
            onClick={onClose}
            className="rounded border border-border px-3 py-1 text-sm text-text-secondary hover:bg-bg-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Cancel
          </button>
          <button
            type="submit"
            data-testid="form-save"
            disabled={!canSubmit}
            className="rounded bg-accent px-3 py-1 text-sm text-white hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  // When this Field has an error, propagate aria-invalid + aria-describedby
  // to the single child input so SR users hear "invalid entry, <error text>"
  // when they focus the field. The error <p> below uses the same id.
  // (WCAG 3.3.1 Error Identification, 1.3.1 Info and Relationships.)
  const errorId = `form-error-${label.toLowerCase()}`;
  const child =
    error && isValidElement(children)
      ? cloneElement(children, {
          "aria-invalid": true,
          "aria-describedby": errorId,
        } as Partial<React.ComponentProps<"input">>)
      : children;
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={htmlFor}
        className="text-xs uppercase tracking-wide text-text-muted"
      >
        {label}
      </label>
      {child}
      {error && (
        <p
          id={errorId}
          data-testid={errorId}
          className="text-[11px] text-status-error"
        >
          {error}
        </p>
      )}
    </div>
  );
}

function KeyValueEditor({
  entries,
  onChange,
  testidPrefix,
  fieldLabel,
}: {
  entries: [string, string][];
  onChange: (next: [string, string][]) => void;
  testidPrefix: string;
  fieldLabel: string;
}) {
  const updateAt = (i: number, k: string, v: string) => {
    const next = entries.slice();
    next[i] = [k, v];
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-1">
      {entries.map(([k, v], i) => (
        <div key={i} className="flex gap-1">
          <input
            data-testid={`${testidPrefix}-key-${i}`}
            type="text"
            value={k}
            onChange={(e) => updateAt(i, e.target.value, v)}
            placeholder="KEY"
            aria-label={`${fieldLabel} ${i + 1} key`}
            className="w-32 rounded border border-border bg-bg-tertiary px-2 py-1 text-xs text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
          <input
            data-testid={`${testidPrefix}-val-${i}`}
            type="text"
            value={v}
            onChange={(e) => updateAt(i, k, e.target.value)}
            placeholder="value"
            aria-label={k ? `${fieldLabel} ${k} value` : `${fieldLabel} ${i + 1} value`}
            className="flex-1 rounded border border-border bg-bg-tertiary px-2 py-1 text-xs text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
          <button
            type="button"
            data-testid={`${testidPrefix}-remove-${i}`}
            aria-label={k ? `Remove ${k}` : "Remove row"}
            onClick={() => onChange(entries.filter((_, j) => j !== i))}
            className="rounded-sm px-1 text-text-muted hover:text-status-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        data-testid={`${testidPrefix}-add`}
        aria-label={`Add ${fieldLabel} entry`}
        onClick={() => onChange([...entries, ["", ""]])}
        className="self-start rounded border border-border px-2 py-0.5 text-[11px] text-text-secondary hover:bg-bg-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        + Add
      </button>
    </div>
  );
}
