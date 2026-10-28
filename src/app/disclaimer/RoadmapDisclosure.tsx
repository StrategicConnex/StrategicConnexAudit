import { PUBLIC_ROADMAP, ROADMAP_GROUPS, type RoadmapGroupId } from "@/shared/data/public-roadmap";

/** Tipo espejo del namespace "disclaimer.roadmap" del JSON local. */
export type RoadmapMessages = {
  title: string;
  notice: string;
  dateToBeConfirmed: string;
  groups: Record<RoadmapGroupId, string>;
  items: Record<string, string>;
};

const LOCALE_TAG: Record<"es" | "en", string> = { es: "es-ES", en: "en-US" };

/**
 * Bloque colapsable `<details>` con la hoja de ruta pública fechada.
 * HTML nativo (details/summary/time): sin scripts, sin CSP nueva.
 * La cookie de aceptación y el botón NO cambian — este bloque es informativo.
 */
export function RoadmapDisclosure({
  messages,
  locale,
}: {
  messages: RoadmapMessages;
  locale: "es" | "en";
}) {
  // El ISO es una fecha de calendario (sin hora): se formatea en UTC para que
  // la proyección no dependa de la zona horaria del servidor/visitante
  // (en UTC+2, un Date de medianoche UTC caería el día anterior).
  const fmt = new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <details role="group" className="rounded-lg border border-border bg-card/40 px-6 py-4 text-sm">
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {messages.title}
      </summary>
      <div className="mt-4 space-y-4 text-muted-foreground">
        {ROADMAP_GROUPS.map((group) => (
          <section key={group.id} data-roadmap-group={group.id}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground/80">
              {messages.groups[group.id]}
            </h3>
            <ul className="mt-2 space-y-1 leading-relaxed">
              {PUBLIC_ROADMAP.filter((item) => item.group === group.id).map((item) => (
                <li key={item.id} className="pl-4">
                  {item.targetDate ? (
                    <>
                      <time dateTime={item.targetDate}>
                        {fmt.format(new Date(`${item.targetDate}T00:00:00Z`))}
                      </time>
                      {" — "}
                    </>
                  ) : (
                    <>
                      <span>{messages.dateToBeConfirmed}</span>
                      {" — "}
                    </>
                  )}
                  {messages.items[item.id]}
                </li>
              ))}
            </ul>
          </section>
        ))}
        <p className="text-xs text-muted-foreground/80">{messages.notice}</p>
      </div>
    </details>
  );
}
