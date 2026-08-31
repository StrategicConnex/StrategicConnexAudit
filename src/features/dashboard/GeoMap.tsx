'use client';

import { useEffect, useRef, useMemo, useCallback } from 'react';
import { MapPin } from 'lucide-react';
import type { Map as LeafletMap } from 'leaflet';
import type { Investigation } from './tabs/intelligence/types';
import { logger } from "@/lib/logger";

interface GeoLocation {
  lat: number;
  lng: number;
  label: string;
  sublabel: string;
  type: 'target' | 'asn' | 'hop' | 'cdn' | 'reverse';
  countryCode?: string;
  cityName?: string;
  ip?: string;
  asn?: string;
}

interface GeoMapProps {
  metadata?: Investigation["metadata"];
  target?: string;
}

type LeafletNS = typeof import('leaflet');

const TYPE_COLORS: Record<string, string> = {
  target: '#6271C4',
  asn: '#D4373C',
  hop: '#EBA52D',
  cdn: '#8BC34A',
  reverse: '#71717A',
};

export function GeoMap({ metadata, target }: GeoMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<LeafletMap | null>(null);
  const layersRef = useRef<Array<{ remove: () => void }>>([]);

  const geoPoints = useMemo((): GeoLocation[] => {
    const points: GeoLocation[] = [];
    const seen = new Set<string>();

    const asnGeo = metadata?.asnGeo;
    if (asnGeo?.latitude && asnGeo?.longitude) {
      const key = `${asnGeo.latitude.toFixed(2)}_${asnGeo.longitude.toFixed(2)}`;
      if (!seen.has(key)) {
        seen.add(key);
        points.push({
          lat: Number(asnGeo.latitude),
          lng: Number(asnGeo.longitude),
          label: target || asnGeo.ipAddress || 'Target',
          sublabel: [asnGeo.cityName, asnGeo.countryName].filter(Boolean).join(', '),
          type: 'target',
          countryCode: asnGeo.countryCode ?? undefined,
          cityName: asnGeo.cityName ?? undefined,
          ip: asnGeo.ipAddress ?? undefined,
          asn: asnGeo.asn ?? undefined,
        });
      }
    }

    const traceroute = metadata?.traceroute;
    if (traceroute && Array.isArray(traceroute)) {
      for (const hop of traceroute) {
        if (hop.countryCode && hop.countryCode !== 'LAN') {
          const coords = countryToLatLng(hop.countryCode, hop.cityName ?? undefined);
          const key = `${coords.lat.toFixed(1)}_${coords.lng.toFixed(1)}`;
          if (!seen.has(key)) {
            seen.add(key);
            points.push({
              lat: coords.lat,
              lng: coords.lng,
              label: hop.hostname || hop.ip || `Hop ${hop.hop}`,
              sublabel: `${hop.cityName || 'Unknown'}, ${hop.countryCode} • ${hop.latencyMs}ms`,
              type: 'hop',
              countryCode: hop.countryCode ?? undefined,
              cityName: hop.cityName ?? undefined,
              ip: hop.ip ?? undefined,
            });
          }
        }
      }
    }

    const cdn = metadata?.cdnWaf;
    if (cdn?.detected) {
      const cdnCoords: Record<string, { lat: number; lng: number }> = {
        Cloudflare: { lat: 37.751, lng: -97.822 },
        'AWS CloudFront': { lat: 38.627, lng: -90.199 },
        Fastly: { lat: 37.7749, lng: -122.4194 },
        Akamai: { lat: 42.3601, lng: -71.0589 },
        Sucuri: { lat: 25.7617, lng: -80.1918 },
      };
      const provider = cdn.name || cdn.provider || '';
      const found = Object.entries(cdnCoords).find(([name]) =>
        provider.toLowerCase().includes(name.toLowerCase())
      );
      if (found) {
        const key = `cdn_${found[0]}`;
        if (!seen.has(key)) {
          seen.add(key);
          points.push({
            lat: found[1].lat,
            lng: found[1].lng,
            label: provider,
            sublabel: 'CDN/WAF Edge',
            type: 'cdn',
          });
        }
      }
    }

    return points;
  }, [metadata, target]);

  const createIcon = useCallback((L: LeafletNS, type: string, isTarget: boolean) => {
    const color = TYPE_COLORS[type] || '#71717A';
    const size = isTarget ? 14 : 10;
    return L.divIcon({
      className: 'leaflet-marker-scahudit',
      html: `<div style="
        width:${size * 2}px;height:${size * 2}px;
        background:${color}22;
        border:2px solid ${color};
        border-radius:50%;
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 0 16px ${color}66, inset 0 0 8px ${color}33;
      ">
        <div style="width:${size}px;height:${size}px;background:${color};border-radius:50%;${isTarget ? 'box-shadow:0 0 12px ' + color : ''}"></div>
      </div>`,
      iconSize: [size * 2, size * 2],
      iconAnchor: [size, size],
    });
  }, []);

  const addMarkersAndLines = useCallback((L: LeafletNS, map: LeafletMap, points: GeoLocation[]) => {
    const markerGroup = L.layerGroup().addTo(map);
    const lineGroup = L.layerGroup().addTo(map);
    const latlngs: [number, number][] = [];
    const targetPoint = points.find(p => p.type === 'target');

    for (const point of points) {
      const isTarget = point.type === 'target';
      const icon = createIcon(L, point.type, isTarget);
      const marker = L.marker([point.lat, point.lng], { icon }).addTo(markerGroup);

      marker.bindTooltip(`
        <div style="font-family:system-ui,sans-serif;line-height:1.4">
          <div style="font-weight:700;font-size:13px;color:#e4e4e7">${escapeHtml(point.label)}</div>
          <div style="font-size:11px;color:#a1a1aa;margin-top:2px">${escapeHtml(point.sublabel)}</div>
          ${point.ip ? `<div style="font-size:10px;color:#71717a;font-family:monospace;margin-top:2px">${escapeHtml(point.ip)}</div>` : ''}
          ${point.asn ? `<div style="font-size:10px;color:#71717a;font-family:monospace">${escapeHtml(point.asn)}</div>` : ''}
        </div>
      `, {
        direction: 'top',
        offset: L.point(0, -10),
        className: 'leaflet-tooltip-scahudit',
      });

      marker.bindPopup(`
        <div style="font-family:system-ui,sans-serif;min-width:160px">
          <div style="font-weight:700;font-size:14px;color:#e4e4e7;margin-bottom:4px">${escapeHtml(point.label)}</div>
          <div style="font-size:11px;color:#a1a1aa">${escapeHtml(point.sublabel)}</div>
          <hr style="border:0;border-top:1px solid #2a2a2a;margin:8px 0">
          <div style="font-size:11px;color:#71717a">
            ${point.type === 'target' ? '📍 Primary Target' : ''}
            ${point.type === 'hop' ? '🔄 Traceroute Hop' : ''}
            ${point.type === 'cdn' ? '☁️ CDN/WAF Edge' : ''}
          </div>
          <div style="font-size:9px;color:#52525b;margin-top:6px">${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}</div>
        </div>
      `, {
        className: 'leaflet-popup-scahudit',
        maxWidth: 280,
      });

      latlngs.push([point.lat, point.lng]);
    }

    if (targetPoint && points.length > 1) {
      for (const point of points) {
        if (point.type === 'target') continue;
        const polyline = L.polyline(
          [[targetPoint.lat, targetPoint.lng], [point.lat, point.lng]],
          {
            color: TYPE_COLORS[point.type] || '#71717A',
            weight: 1.5,
            opacity: 0.35,
            dashArray: '6 8',
          }
        ).addTo(lineGroup);
        (polyline as unknown as { _path: HTMLElement })._path.style.animation = 'scahudit-dash-flow 3s linear infinite';
      }
    }

    if (latlngs.length > 0) {
      const bounds = L.latLngBounds(latlngs);
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 8 });
    }

    layersRef.current = [markerGroup, lineGroup];
  }, [createIcon]);

  const clearLayers = useCallback(() => {
    for (const layer of layersRef.current) {
      if (layer?.remove) layer.remove();
    }
    layersRef.current = [];
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const initMap = async () => {
      try {
        const leafletModule = await import('leaflet');
        const L = leafletModule.default || leafletModule;
        await import('leaflet/dist/leaflet.css');

        delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
        // Markers self-hosted (public/vendor/leaflet) — sin CDN de terceros:
        // un <img> de unpkg/leaflet filtraría IP + Referer (y el área del mapa
        // que el analista está viendo) a un tercero.
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: '/vendor/leaflet/marker-icon-2x.png',
          iconUrl: '/vendor/leaflet/marker-icon.png',
          shadowUrl: '/vendor/leaflet/marker-shadow.png',
        });

        const map = L.map(mapContainerRef.current!, {
          zoomControl: true,
          scrollWheelZoom: true,
          attributionControl: false,
        });

        // Fondo de cuadrícula LOCAL (estética SOC/radar del design system) en
        // vez de tiles de CartoCDN: los tiles de terceros revelan la región
        // geográfica consultada por el analista (IP + zona del mapa visible).
        // Sin terceros: cero fuga de geolocalización. Leaflet renderiza igual
        // los markers/polylines; solo se pierde el basemap cartográfico.
        map.createPane('grid');
        const gridPane = map.getPane('grid');
        if (gridPane) gridPane.style.zIndex = '1';
        L.rectangle([[90, -180], [-90, 180]], {
          color: 'rgba(129,140,248,0.12)',
          weight: 0,
          fill: true,
          fillOpacity: 0,
          interactive: false,
        }).addTo(map);
        // Líneas de meridiano/paralelo cada ~30° — referencia visual mínima
        for (let lon = -150; lon <= 150; lon += 30) {
          L.polyline([[90, lon], [-90, lon]], {
            color: 'rgba(129,140,248,0.08)',
            weight: 1,
            interactive: false,
            pane: 'grid',
          }).addTo(map);
        }
        for (let lat = -60; lat <= 60; lat += 30) {
          L.polyline([[lat, -180], [lat, 180]], {
            color: 'rgba(129,140,248,0.08)',
            weight: 1,
            interactive: false,
            pane: 'grid',
          }).addTo(map);
        }
        map.fitWorld();

        mapInstanceRef.current = map;
      } catch (err) {
        logger.error('[GeoMap] Failed to initialize Leaflet:', err);
      }
    };

    initMap();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    import('leaflet').then((leafletModule) => {
      const L = leafletModule.default || leafletModule;
      clearLayers();
      if (geoPoints.length > 0) {
        addMarkersAndLines(L, map, geoPoints);
      }
    });
  }, [geoPoints, addMarkersAndLines, clearLayers]);

  if (geoPoints.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-fg gap-3">
        <MapPin className="w-8 h-8 text-muted-fg/50" />
        <p className="text-xs font-medium">No hay datos de geolocalización disponibles</p>
        <p className="text-2xs text-muted-fg/60">Realiza un escaneo para ver la ubicación de los activos de red</p>
      </div>
    );
  }

  return (
    <div className="relative w-full overflow-hidden rounded-xl" style={{ minHeight: 320 }}>
      <div className="absolute top-3 left-3 z-[1000] flex flex-wrap gap-1.5">
        {Object.entries(TYPE_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5 bg-[#0a0a0a]/80 backdrop-blur-sm border border-white/[0.06] px-2 py-1 rounded-md">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-2xs font-bold text-muted-fg uppercase tracking-wider">{type}</span>
          </div>
        ))}
      </div>

      <div className="absolute bottom-3 right-3 z-[1000] bg-[#0a0a0a]/80 backdrop-blur-sm border border-white/[0.06] px-3 py-1.5 rounded-md">
        <span className="text-2xs font-bold text-muted-fg uppercase tracking-wider">
          {geoPoints.length} nodo{geoPoints.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div ref={mapContainerRef} className="w-full h-[340px] rounded-xl" />

      <style jsx global>{`
        .leaflet-tooltip-scahudit {
          background: #0f0f0f !important;
          border: 1px solid #2a2a2a !important;
          border-radius: 8px !important;
          padding: 8px 10px !important;
          color: #e4e4e7 !important;
          font-size: 12px !important;
          box-shadow: 0 4px 20px rgba(0,0,0,0.6) !important;
        }
        .leaflet-tooltip-scahudit::before {
          border-top-color: #2a2a2a !important;
        }
        .leaflet-popup-scahudit .leaflet-popup-content-wrapper {
          background: #0f0f0f !important;
          border: 1px solid #2a2a2a !important;
          border-radius: 10px !important;
          color: #e4e4e7 !important;
          box-shadow: 0 8px 32px rgba(0,0,0,0.8) !important;
        }
        .leaflet-popup-scahudit .leaflet-popup-tip {
          background: #0f0f0f !important;
          border: 1px solid #2a2a2a !important;
        }
        .leaflet-popup-scahudit .leaflet-popup-close-button {
          color: #71717a !important;
        }
        .leaflet-marker-scahudit {
          background: transparent !important;
          border: none !important;
        }
        @keyframes scahudit-dash-flow {
          to { stroke-dashoffset: -28; }
        }
        .leaflet-container {
          font-family: system-ui, -apple-system, sans-serif !important;
        }
        .leaflet-control-zoom a {
          background: #1a1a1a !important;
          color: #e4e4e7 !important;
          border-color: #2a2a2a !important;
        }
        .leaflet-control-zoom a:hover {
          background: #2a2a2a !important;
        }
      `}</style>
    </div>
  );
}

const COUNTRY_COORDS: Record<string, { lat: number; lng: number }> = {
  US: { lat: 39.8283, lng: -98.5795 },
  DE: { lat: 51.1657, lng: 10.4515 },
  IE: { lat: 53.4129, lng: -8.2439 },
  SG: { lat: 1.3521, lng: 103.8198 },
  ES: { lat: 40.4637, lng: -3.7492 },
  JP: { lat: 35.6762, lng: 139.6503 },
  GB: { lat: 51.5074, lng: -0.1278 },
  FR: { lat: 48.8566, lng: 2.3522 },
  NL: { lat: 52.3676, lng: 4.9041 },
  BR: { lat: -14.2350, lng: -51.9253 },
  AU: { lat: -25.2744, lng: 133.7751 },
  CA: { lat: 56.1304, lng: -106.3468 },
  IT: { lat: 41.8719, lng: 12.5674 },
  RU: { lat: 61.5240, lng: 105.3188 },
  CN: { lat: 35.8617, lng: 104.1954 },
  IN: { lat: 20.5937, lng: 78.9629 },
  AR: { lat: -38.4161, lng: -63.6167 },
  MX: { lat: 23.6345, lng: -102.5528 },
};

function countryToLatLng(countryCode: string, cityName?: string): { lat: number; lng: number } {
  const cityCoords: Record<string, { lat: number; lng: number }> = {
    'Ashburn': { lat: 39.0438, lng: -77.4874 },
    'Frankfurt': { lat: 50.1109, lng: 8.6821 },
    'Dublin': { lat: 53.3498, lng: -6.2603 },
    'Singapore': { lat: 1.3521, lng: 103.8198 },
    'Madrid': { lat: 40.4168, lng: -3.7038 },
    'London': { lat: 51.5074, lng: -0.1278 },
    'Tokyo': { lat: 35.6762, lng: 139.6503 },
    'Paris': { lat: 48.8566, lng: 2.3522 },
    'Amsterdam': { lat: 52.3676, lng: 4.9041 },
    'Sao Paulo': { lat: -23.5505, lng: -46.6333 },
    'Sydney': { lat: -33.8688, lng: 151.2093 },
    'Toronto': { lat: 43.6532, lng: -79.3832 },
    'Mumbai': { lat: 19.0760, lng: 72.8777 },
    'Seoul': { lat: 37.5665, lng: 126.9780 },
    'Moscow': { lat: 55.7558, lng: 37.6173 },
    'Beijing': { lat: 39.9042, lng: 116.4074 },
    'Buenos Aires': { lat: -34.6037, lng: -58.3816 },
    'Mexico City': { lat: 19.4326, lng: -99.1332 },
  };
  if (cityName && cityCoords[cityName]) return cityCoords[cityName];
  const country = COUNTRY_COORDS[countryCode.toUpperCase()];
  if (country) return country;
  return { lat: 30, lng: -30 };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
