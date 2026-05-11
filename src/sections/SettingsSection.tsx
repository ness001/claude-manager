export function SettingsSection() {
  return (
    // WCAG 1.3.1 (Info and Relationships) + 2.4.6 (Headings and Labels):
    // <section> is a sectioning element that contributes a "region"
    // landmark to the AT tree only when it carries an accessible name.
    // Without aria-labelledby, screen-reader users navigating by
    // landmarks/regions (NVDA "D", JAWS region nav, VoiceOver rotor →
    // Landmarks) saw a generic, unnamed region nested inside <main> —
    // they could not jump to "Settings" by name. Bind the <section> to
    // the existing visible <h1> so the rotor surfaces "region, Settings".
    // Mirrors DashboardSection, SessionsSection, and PluginListView,
    // which all already do this.
    <section
      data-testid="settings-section"
      aria-labelledby="settings-heading"
      className="flex flex-col p-8 gap-2"
    >
      <h1
        id="settings-heading"
        className="text-2xl font-semibold text-text-primary"
      >
        Settings
      </h1>
      <p className="text-text-secondary">
        Application preferences and configuration
      </p>
    </section>
  );
}
