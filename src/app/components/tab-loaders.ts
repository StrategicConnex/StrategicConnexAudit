/**
 * Shared lazy loaders for code-split dashboard tabs.
 *
 * Both the `next/dynamic` definition (DashboardContainer) and the hover
 * preload (DashboardSidebar) must call the SAME loader function so they
 * resolve to the same module/chunk and share the module promise cache:
 * hovering the sidebar warms the chunk (it starts downloading immediately),
 * and clicking the tab then mounts it instantly from cache.
 */
export const loadIntelligenceTab = () =>
  import('./tabs/IntelligenceTab').then((mod) => ({ default: mod.IntelligenceTab }));
