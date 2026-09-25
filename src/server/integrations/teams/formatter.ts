import type { TeamsAlert, TeamsSeverity } from "./types";

export interface TeamsMessageCard {
  "@type": "MessageCard";
  "@context": string;
  summary: string;
  themeColor: string;
  title: string;
  text: string;
}

const SEVERITY_COLORS: Record<TeamsSeverity, string> = {
  critical: "dc2626",
  warning: "f59e0b",
  info: "3b82f6",
};

export function formatTeamsAlert(alert: TeamsAlert): TeamsMessageCard {
  const severity = alert.severity.toUpperCase();
  return {
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    summary: `[${severity}] ${alert.type}`,
    themeColor: SEVERITY_COLORS[alert.severity],
    title: `[${severity}] ${alert.type}`,
    text: alert.message,
  };
}
