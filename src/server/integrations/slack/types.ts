export type SlackSeverity = "critical" | "warning" | "info";

export interface SlackAlert {
  type: string;
  message: string;
  severity: SlackSeverity;
}
