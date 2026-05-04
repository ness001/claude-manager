// Search input bound to the session store — see spec §5.5, §17.7.
//
// Controlled `value` (NOT `defaultValue`) so external resets (e.g. switching
// sections) are reflected. Local state is debounced 200ms before being
// committed to the store, per the spec's universal debounce rule.

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

import { useSessionStore } from "../../stores/session-store";

const DEBOUNCE_MS = 200;

export function SessionSearch() {
  const storeQuery = useSessionStore((s) => s.searchQuery);
  const setSearchQuery = useSessionStore((s) => s.setSearchQuery);

  // Local mirror so typing feels instant; the debounced effect commits to the
  // store. The two refs disambiguate "user typed and we've queued a commit"
  // (`pendingLocal`) from "we already wrote this value to the store"
  // (`lastCommitted`). When the store changes to something neither of those,
  // it was an external write (e.g. a section switch) and we re-sync `local`.
  const [local, setLocal] = useState(storeQuery);
  const pendingLocal = useRef(storeQuery);
  const lastCommitted = useRef(storeQuery);

  // Sync local from store ONLY when the store moves to a value we didn't
  // initiate. We deliberately omit `local` from the dep list — typing already
  // drives `local`, so re-running this effect on every keystroke would defeat
  // the debounced commit below.
  const localRef = useRef(local);
  localRef.current = local;
  useEffect(() => {
    if (storeQuery !== localRef.current && storeQuery !== pendingLocal.current) {
      setLocal(storeQuery);
      pendingLocal.current = storeQuery;
      lastCommitted.current = storeQuery;
    }
  }, [storeQuery]);

  useEffect(() => {
    pendingLocal.current = local;
    if (local === lastCommitted.current) return;
    const handle = setTimeout(() => {
      lastCommitted.current = local;
      setSearchQuery(local);
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [local, setSearchQuery]);

  return (
    <label className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-bg-tertiary text-text-secondary">
      <Search size={14} aria-hidden="true" />
      <input
        type="search"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder="Search sessions"
        aria-label="Search sessions"
        className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
      />
    </label>
  );
}
