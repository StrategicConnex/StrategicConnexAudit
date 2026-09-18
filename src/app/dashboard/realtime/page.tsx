"use client";

import { useState, useEffect } from "react";
import { RealtimeProvider } from "@/shared/lib/realtime";

export default function RealtimeDashboard() {
  const [events, setEvents] = useState<Record<string, unknown>[]>([]);
  const [provider] = useState(() => new RealtimeProvider());

  useEffect(() => {
    const unsub = provider.subscribe("updates", (data: Record<string, unknown>) => {
      setEvents((prev) => [...prev.slice(-9), data]);
    });
    return () => {
      unsub();
      provider.destroy();
    };
  }, [provider]);

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">Real-time Dashboard</h1>
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Live Events</h2>
        <div className="space-y-2">
          {events.length === 0 && (
            <p className="text-gray-500">No events yet...</p>
          )}
          {events.map((event, i) => (
            <div key={i} className="p-2 bg-gray-50 rounded">
              {JSON.stringify(event)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
