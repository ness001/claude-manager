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

import { useEffect, useMemo, useState } from "react";

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
      aria-label={isEdit ? "Edit MCP server" : "Add MCP server"}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        data-testid="mcp-form"
        className="flex max-h-[90vh] w-[500px] flex-col gap-3 overflow-auto rounded-md border border-border bg-card-bg p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-text-primary">
          {isEdit ? "Edit MCP Server" : "Add MCP Server"}
        </h2>

        <Field label="Name" error={nameError}>
          <input
            data-testid="form-name"
            type="text"
            aria-label="Server name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary"
          />
        </Field>

        <Field label="Scope">
          <div className="flex gap-3 text-sm">
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
          <div className="flex gap-3 text-sm">
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
            <Field label="Command" error={commandError}>
              <input
                data-testid="form-command"
                type="text"
                aria-label="Command"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                className="w-full rounded border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary"
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
                      className="text-text-muted hover:text-status-error"
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
                  className="flex-1 rounded border border-border bg-bg-tertiary px-2 py-1 text-xs text-text-primary"
                />
              </div>
            </Field>
          </>
        ) : (
          <>
            <Field label="URL" error={urlError}>
              <input
                data-testid="form-url"
                type="text"
                aria-label="URL"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full rounded border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary"
              />
            </Field>
            <Field label="Headers">
              <KeyValueEditor
                entries={headers}
                onChange={setHeaders}
                testidPrefix="form-header"
              />
            </Field>
          </>
        )}

        <Field label="Env">
          <KeyValueEditor
            entries={env}
            onChange={setEnv}
            testidPrefix="form-env"
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
            type="button"
            data-testid="form-save"
            disabled={!canSubmit}
            onClick={() => {
              void handleSubmit();
            }}
            className="rounded bg-accent px-3 py-1 text-sm text-white hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs uppercase tracking-wide text-text-muted">
        {label}
      </label>
      {children}
      {error && (
        <p
          data-testid={`form-error-${label.toLowerCase()}`}
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
}: {
  entries: [string, string][];
  onChange: (next: [string, string][]) => void;
  testidPrefix: string;
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
            className="w-32 rounded border border-border bg-bg-tertiary px-2 py-1 text-xs text-text-primary"
          />
          <input
            data-testid={`${testidPrefix}-val-${i}`}
            type="text"
            value={v}
            onChange={(e) => updateAt(i, k, e.target.value)}
            placeholder="value"
            className="flex-1 rounded border border-border bg-bg-tertiary px-2 py-1 text-xs text-text-primary"
          />
          <button
            type="button"
            data-testid={`${testidPrefix}-remove-${i}`}
            aria-label={k ? `Remove ${k}` : "Remove row"}
            onClick={() => onChange(entries.filter((_, j) => j !== i))}
            className="px-1 text-text-muted hover:text-status-error"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        data-testid={`${testidPrefix}-add`}
        onClick={() => onChange([...entries, ["", ""]])}
        className="self-start rounded border border-border px-2 py-0.5 text-[11px] text-text-secondary hover:bg-bg-tertiary"
      >
        + Add
      </button>
    </div>
  );
}
