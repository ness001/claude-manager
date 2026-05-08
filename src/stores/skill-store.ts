// Custom skills store — see plan T3.7, spec §7, §17.7 (search behavior).
//
// Pure store: holds the loaded `CustomSkill[]`, the search query, an
// `isLoading` flag, and the most recent error. `filterSkills` lives outside
// the store so callers can `useMemo` it without re-rendering on every
// keystroke (mirrors `filterPlugins`).

import { create } from "zustand";

import { loadCustomSkills } from "../lib/skill-loader";
import type { CustomSkill } from "../lib/skill-types";

interface SkillStoreState {
  skills: CustomSkill[];
  searchQuery: string;
  isLoading: boolean;
  error: string | null;

  loadSkills: () => Promise<void>;
  setSearchQuery: (query: string) => void;
}

export const useSkillStore = create<SkillStoreState>((set) => ({
  skills: [],
  searchQuery: "",
  isLoading: false,
  error: null,

  loadSkills: async () => {
    set({ isLoading: true, error: null });
    try {
      const skills = await loadCustomSkills();
      set({ skills, isLoading: false });
    } catch (err) {
      // Spec §17.5 / plan case 3: error path → record error, no partial mutation.
      set({ isLoading: false, error: errorMessage(err) });
    }
  },

  setSearchQuery: (query) => set({ searchQuery: query }),
}));

/**
 * Free filter — search per spec §17.7 (Skills: name, description,
 * case-insensitive substring).
 */
export function filterSkills(
  skills: CustomSkill[],
  searchQuery: string,
): CustomSkill[] {
  const q = searchQuery.trim().toLowerCase();
  if (q === "") return skills;
  return skills.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q),
  );
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
