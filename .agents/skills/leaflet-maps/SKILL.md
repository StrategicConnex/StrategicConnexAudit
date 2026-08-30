---
name: leaflet-maps
description: "Expert in Leaflet geographic visualization for IP geolocation, threat maps, and geographic intelligence in SCAUDIT. Use when building or modifying map-based visualizations."
risk: safe
source: strategicaudit-pro-custom
date_added: "2026-08-29"
tags:
  - leaflet
  - maps
  - geolocation
  - geoip
  - threat-map
  - visualization
---

# Leaflet Maps Expert

Expert in Leaflet for geographic visualization in SCAUDIT. Covers IP geolocation display, threat maps, and geographic intelligence overlays.

## When to Use This Skill

- When building or modifying the GeoMap component (`src/features/dashboard/GeoMap.tsx`)
- When visualizing IP geolocation data
- When building threat maps or attack origin visualization
- When displaying geographic distribution of assets or findings
- When working with location-based intelligence data

## Core Patterns

### Basic Map Setup

```tsx
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";

export function GeoMap({ locations }: { locations: GeoLocation[] }) {
  return (
    <MapContainer
      center={[20, 0]}  // World center
      zoom={2}
      style={{ height: "400px", width: "100%" }}
      scrollWheelZoom={false}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap contributors'
      />
      {locations.map((loc) => (
        <Marker key={loc.id} position={[loc.lat, loc.lng]}>
          <Popup>
            <strong>{loc.ip}</strong><br />
            {loc.city}, {loc.country}<br />
            Org: {loc.org}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
```

### Threat Map Overlay

Show attack origins with severity-based coloring:

```tsx
function ThreatMarker({ threat }: { threat: ThreatEvent }) {
  const color = severityColors[threat.severity];
  
  return (
    <CircleMarker
      center={[threat.lat, threat.lng]}
      radius={threat.intensity * 3}
      fillColor={color}
      color={color}
      fillOpacity={0.6}
    >
      <Popup>
        <div>
          <strong>{threat.sourceIP}</strong>
          <p>Severity: {threat.severity}</p>
          <p>Target: {threat.target}</p>
          <p>Technique: {threat.mitreTechnique}</p>
        </div>
      </Popup>
    </CircleMarker>
  );
}
```

### Asset Distribution Map

Show discovered assets by geographic location:

```tsx
function AssetDistributionMap({ assets }: { assets: IntelligenceAsset[] }) {
  const groupedByLocation = groupBy(assets, "country");
  
  return (
    <MapContainer center={[20, 0]} zoom={2} style={{ height: "500px" }}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {Object.entries(groupedByLocation).map(([country, countryAssets]) => (
        <Marker
          key={country}
          position={getCountryCenter(country)}
        >
          <Popup>
            <strong>{country}</strong>: {countryAssets.length} assets
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
```

## Leaflet Fix for Next.js

Leaflet requires a dynamic import to avoid SSR issues:

```tsx
import dynamic from "next/dynamic";

const GeoMap = dynamic(() => import("./GeoMap"), {
  ssr: false,
  loading: () => <div className="h-[400px] bg-muted animate-pulse rounded-lg" />,
});
```

## Map Styling

Use the SCAUDIT theme for map containers:

```tsx
<MapContainer
  className="rounded-lg border border-border"
  style={{ backgroundColor: "hsl(var(--background))" }}
>
```

## Sharp Edges

### SSR hydration mismatch
**Problem:** Leaflet uses `window` and `document`, causing SSR errors.
**Fix:** Always use `dynamic(() => import(...), { ssr: false })` for Leaflet components.

### Default marker icon missing
**Problem:** Marker icons don't show in production.
**Fix:** Import Leaflet CSS and configure marker icons explicitly.

### Performance with many markers
**Problem:** 1000+ markers cause lag.
**Fix:** Use `MarkerClusterGroup` from `react-leaflet-markercluster` for clustering.

## Related Skills
- `react-flow-graphs` (graph visualizations)
- `recharts-dashboard` (chart visualizations)
- `cyber-intelligence` (data source for geo data)

## When to Use
- User mentions maps, geographic, geolocation, or IP location
- User mentions Leaflet, threat map, or attack visualization
- User needs to display geographic distribution of assets or threats

## Limitations
- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.
