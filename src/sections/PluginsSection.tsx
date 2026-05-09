// Plugins section — see spec §6 (panel structure), §17.6 (loading + empty
// states). Single-column layout (unlike Sessions, this panel doesn't have a
// sidebar). Loads plugins on mount; selection is held in the plugin store.
//
// If no plugin is selected → render PluginListView.
// If a plugin is selected → render PluginDetailView with a Back arrow that
// clears the selection.

import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";

import { PluginListView } from "../components/plugins/PluginListView";
import { PluginDetailView } from "../components/plugins/PluginDetailView";
import { usePluginStore } from "../stores/plugin-store";

export function PluginsSection() {
  const loadPlugins = usePluginStore((s) => s.loadPlugins);
  const selectPlugin = usePluginStore((s) => s.selectPlugin);
  const selectedPlugin = usePluginStore((s) => s.selectedPlugin);

  useEffect(() => {
    void loadPlugins();
  }, [loadPlugins]);

  if (selectedPlugin) {
    return (
      <section
        data-testid="plugins-section"
        className="flex h-full flex-col"
      >
        <button
          type="button"
          data-testid="plugin-back-btn"
          onClick={() => {
            void selectPlugin(null);
          }}
          className="flex items-center gap-1 px-6 pt-4 text-sm text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Back to plugins
        </button>
        <PluginDetailView plugin={selectedPlugin} />
      </section>
    );
  }

  return (
    <section data-testid="plugins-section" className="flex h-full">
      <PluginListView />
    </section>
  );
}
