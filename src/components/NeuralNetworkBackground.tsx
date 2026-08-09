"use client";

/**
 * NeuralNetworkBackground — fondo animado de red neuronal para la página de login.
 *
 * Canvas 2D puro (cero dependencias, ~3KB gzip). Estética Cyber-Intelligence:
 * nodos pequeños (1-2.5px) con pulsación lenta, conexiones dinámicas por
 * proximidad (aparecen/desaparecen según distancia), 3 clusters densos que
 * evocan auditoría/análisis, y pulsos de "scan" horizontales ocasionales que
 * simulan monitoreo activo. Cero interacción con mouse.
 *
 * THEME: los colores viven en tokens CSS (--neural-node / --neural-line /
 * --neural-canvas-opacity) vinculados al theme switcher existente (data-theme).
 * useThemeSync() envuelve useTheme() del design system (ya es reactivo vía
 * useSyncExternalStore) y re-lee los tokens al cambiar de tema.
 *
 * A11Y: aria-hidden, pointer-events none, z-index 0. Con prefers-reduced-motion
 * se dibuja UN frame estático (sin loop) — red fija, sin pulsos ni scan.
 */

import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/shared/design-system";

interface NeuralNetworkBackgroundProps {
  /**
   * Micro-detalle contextual: los nodos cercanos al formulario aumentan su
   * frecuencia de pulso (sin moverse) → "el sistema está escuchando".
   * Se desactiva con reduced-motion.
   */
  listening?: boolean;
}

/* ─── Parámetros de la simulación ─────────────────────────────────────────── */
const NODE_COUNT = 60;
const CLUSTER_COUNT = 3;
const LINK_DISTANCE = 150;          // px — umbral de proximidad para dibujar conexión
const LINK_SPARSE = 0.6;            // factor de distancia en el frame estático
const DRIFT_MIN = 4;                // px/s — deriva ultra-lenta (<0.1 px/frame a 60fps)
const DRIFT_MAX = 12;               // px/s — (<0.2 px/frame a 60fps)
const PULSE_MIN = 4;                // s — ciclo de pulsación mínimo (>4s requerido)
const PULSE_MAX = 8;                // s — ciclo máximo
const LISTEN_BOOST = 1.9;           // multiplicador de pulso al "escuchar"
const SCAN_EVERY_MIN = 8_000;       // ms — pulso de scan cada 8-12s
const SCAN_EVERY_MAX = 12_000;
const SCAN_WIDTH = 60;              // px — ancho del frente de scan
const SCAN_DURATION = 1_200;        // ms — duración del barrido
const MAX_DT = 50;                  // ms — clamp para evitar saltos al volver a la pestaña

interface SimNode {
  x: number; // 0..1 normalizado (resize-proof)
  y: number;
  vx: number; // px/s
  vy: number;
  radius: number;      // px base (1-2; clusters hasta 2.5)
  phase: number;       // rad — fase de pulsación
  pulseSpeed: number;  // rad/s
  isCluster: boolean;
}

/** Sincronización de tema — wrapper del provider existente (resolved: light|dark). */
function useThemeSync(): "light" | "dark" {
  return useTheme().resolved;
}

export function NeuralNetworkBackground({ listening = false }: NeuralNetworkBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const theme = useThemeSync();
  const [reducedMotion, setReducedMotion] = useState(false);

  // Refs mutables leídos por el loop (evita re-montar la simulación).
  const listeningRef = useRef(listening);
  useEffect(() => {
    listeningRef.current = listening;
  }, [listening]);

  const colorsRef = useRef({ node: "#7C3AED", line: "rgba(124,58,237,0.15)" });
  useEffect(() => {
    // Re-leer tokens CSS al cambiar de tema (barato: 1 vez por cambio).
    const cs = getComputedStyle(document.documentElement);
    colorsRef.current = {
      node: cs.getPropertyValue("--neural-node").trim() || "#7C3AED",
      line: cs.getPropertyValue("--neural-line").trim() || "rgba(124,58,237,0.15)",
    };
  }, [theme]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReducedMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // ─── Simulación — montada UNA vez, lee los refs mutables ─────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let raf = 0;
    let lastT = performance.now();
    let nextScanAt = performance.now() + SCAN_EVERY_MIN;
    let scanX = -1;        // posición del frente de scan (-1 = inactivo)

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // Clusters de auditoría: 3 zonas densas cerca del centro (donde vive el
    // formulario) → evocan "análisis/escaneo" sin competir con la legibilidad.
    const clusterCenters = Array.from({ length: CLUSTER_COUNT }, () => ({
      x: 0.25 + Math.random() * 0.5,
      y: 0.3 + Math.random() * 0.4,
    }));

    const nodes: SimNode[] = Array.from({ length: NODE_COUNT }, (_, i) => {
      const isCluster = i < NODE_COUNT * 0.4;
      let x: number;
      let y: number;
      if (isCluster) {
        const c = clusterCenters[i % CLUSTER_COUNT];
        // Desviación gaussiana aproximada (suma de 2 uniformes) → densidad real
        const spread = (Math.random() + Math.random() - 1) * 0.1;
        x = c.x + spread;
        y = c.y + spread;
      } else {
        x = Math.random();
        y = Math.random();
      }
      const pulseSpeed = (2 * Math.PI) / (PULSE_MIN + Math.random() * (PULSE_MAX - PULSE_MIN));
      return {
        x,
        y,
        vx: (Math.random() - 0.5) * (DRIFT_MAX - DRIFT_MIN) * 2,
        vy: (Math.random() - 0.5) * (DRIFT_MAX - DRIFT_MIN) * 2,
        radius: isCluster ? 1.6 + Math.random() * 0.9 : 1 + Math.random() * 1,
        phase: Math.random() * Math.PI * 2,
        pulseSpeed,
        isCluster,
      };
    });

    // ─── Conectividad por proximidad (lógica clave) ────────────────────────
    // Cada frame se recalculan las distancias: solo se dibuja una línea si el
    // par está por debajo de LINK_DISTANCE, con alfa proporcional a la cercanía
    // (1 - d/LINK_DISTANCE). Así las conexiones "aparecen/desaparecen" con la
    // deriva, en vez de ser un gráfico estático.
    const drawFrame = (now: number, dt: number, staticFrame = false) => {
      const { node, line } = colorsRef.current;
      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;
      const w = Math.max(width, 1);
      const h = Math.max(height, 1);

      // Deriva ultra-lenta (px/s → px/frame a 60fps ≈ 0.07-0.2px) + rebote en bordes
      if (!staticFrame) {
        for (const n of nodes) {
          n.x += (n.vx * dt) / w;
          n.y += (n.vy * dt) / h;
          if (n.x < 0 || n.x > 1) { n.vx *= -1; n.x = Math.min(1, Math.max(0, n.x)); }
          if (n.y < 0 || n.y > 1) { n.vy *= -1; n.y = Math.min(1, Math.max(0, n.y)); }
          n.phase += n.pulseSpeed * dt;
        }
      }

      // 1) Conexiones (alfa por proximidad)
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const ax = a.x * w;
          const ay = a.y * h;
          const bx = b.x * w;
          const by = b.y * h;
          const d = Math.hypot(bx - ax, by - ay);
          const maxD = LINK_DISTANCE * (staticFrame ? LINK_SPARSE : 1);
          if (d < maxD) {
            // α = cercanía relativa (1 en contacto, 0 en el umbral)
            const alpha = (1 - d / maxD) * 0.9;
            ctx.strokeStyle = line;
            ctx.globalAlpha = alpha;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;

      // 2) Nodos con pulsación (ciclo >4s) y glow en clusters
      const scanActive = !staticFrame && scanX >= 0;
      const listeningActive = !staticFrame && listeningRef.current;
      for (const n of nodes) {
        const px = n.x * w;
        const py = n.y * h;

        // Pulsación: radio oscila ±30% con sin(phase). El boost "listening"
        // acelera la fase de nodos cercanos al formulario (centro).
        const pulse = 0.3 * Math.sin(n.phase);
        if (listeningActive && Math.abs(n.x - 0.5) < 0.28 && Math.abs(n.y - 0.5) < 0.35) {
          n.phase += (n.pulseSpeed * LISTEN_BOOST - n.pulseSpeed) * dt * 0.5; // aceleración suave
        }
        const r = Math.max(0.6, n.radius * (1 + pulse));

        // El frente de scan resalta lo que cruza (monitoreo activo)
        let glowBoost = 0;
        if (scanActive && Math.abs(px - scanX) < SCAN_WIDTH) {
          glowBoost = (1 - Math.abs(px - scanX) / SCAN_WIDTH) * 0.8;
        }

        if (n.isCluster || glowBoost > 0) {
          ctx.shadowColor = node;
          ctx.shadowBlur = (n.isCluster ? 6 : 0) + glowBoost * 8;
        } else {
          ctx.shadowBlur = 0;
        }
        ctx.fillStyle = node;
        ctx.globalAlpha = 0.75 + glowBoost * 0.25 + 0.25 * (0.5 + 0.5 * Math.sin(n.phase));
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      void cx; void cy;
    };

    // ─── Loop principal (rAF) ──────────────────────────────────────────────
    const loop = (t: number) => {
      const dt = Math.min((t - lastT) / 1000, MAX_DT / 1000);
      lastT = t;

      if (scanX < 0 && t >= nextScanAt) {
        scanX = 0;
        nextScanAt = t + SCAN_EVERY_MIN + Math.random() * (SCAN_EVERY_MAX - SCAN_EVERY_MIN);
      }
      if (scanX >= 0) {
        scanX += (width + SCAN_WIDTH * 2) / (SCAN_DURATION / 1000) * dt;
        if (scanX > width + SCAN_WIDTH) scanX = -1;
      }

      drawFrame(t, dt);
      raf = requestAnimationFrame(loop);
    };

    if (reducedMotion) {
      // Fallback estático accesible: un único frame de la red (sin loop, sin pulsos)
      drawFrame(performance.now(), 0, true);
    } else {
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 z-0 w-full h-full pointer-events-none"
      style={{ opacity: "var(--neural-canvas-opacity)" }}
    />
  );
}
