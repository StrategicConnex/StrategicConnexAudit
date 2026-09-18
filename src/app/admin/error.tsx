"use client";

import { RouteErrorBoundary } from "@/shared/design-system/route-error-boundary";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorBoundary error={error} reset={reset} routeLabel="Administración" />;
}
