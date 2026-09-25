export type TeamsSeverity = "critical" | "warning" | "info";

export interface TeamsAlert {
  type: string;
  message: string;
  severity: TeamsSeverity;
}
