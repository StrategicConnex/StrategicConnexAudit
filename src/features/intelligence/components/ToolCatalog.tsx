"use client";

import React, { useState, useMemo } from "react";
import { useIntelligenceStore, IntelligenceState } from "../stores/intelligence-store";
import { 
  Search, 
  Mail, 
  Globe, 
  Key, 
  ShieldAlert, 
  SearchIcon, 
  Compass, 
  Cpu,
  Terminal,
  Activity,
  Layers,
  LucideIcon
} from "lucide-react";

type ToolCategory = "dns" | "network" | "email-security" | "website" | "ssl-tls" | "threat" | "osint" | "ai";
type ToolRisk = "passive" | "active-safe" | "active-intrusive";

interface ToolDefinition {
  id: string;
  name: string;
  category: ToolCategory;
  description: string;
  requiredPlan: "free" | "pro" | "business" | "enterprise";
  risk: ToolRisk;
  costUnits: number;
}

// Mirroring server-side definitions for seamless UI integration
const UI_TOOLS: ToolDefinition[] = [
  { id: "dns.lookup", name: "DNS Lookup", category: "dns", description: "Resuelve y analiza registros DNS principales (A, AAAA).", requiredPlan: "free", risk: "passive", costUnits: 1 },
  { id: "dns.mx", name: "MX Lookup", category: "dns", description: "Encuentra servidores de correo autorizados para el dominio.", requiredPlan: "free", risk: "passive", costUnits: 1 },
  { id: "dns.txt", name: "TXT Lookup", category: "dns", description: "Inspecciona registros TXT y configuraciones de red.", requiredPlan: "free", risk: "passive", costUnits: 1 },
  { id: "dns.ns", name: "NS Lookup", category: "dns", description: "Lista los servidores de nombres autoritativos del target.", requiredPlan: "free", risk: "passive", costUnits: 1 },
  { id: "email.spf", name: "SPF Analyzer", category: "email-security", description: "Analiza mecanismos SPF y límites de búsquedas DNS.", requiredPlan: "free", risk: "passive", costUnits: 2 },
  { id: "email.dkim", name: "DKIM Analyzer", category: "email-security", description: "Valida selectores DKIM y alineación criptográfica.", requiredPlan: "pro", risk: "passive", costUnits: 2 },
  { id: "email.dmarc", name: "DMARC Analyzer", category: "email-security", description: "Inspecciona políticas DMARC y reportes agregados.", requiredPlan: "free", risk: "passive", costUnits: 2 },
  { id: "dns.dnssec", name: "DNSSEC Validation", category: "dns", description: "Verifica firmas de seguridad DNSSEC y cadena de confianza.", requiredPlan: "pro", risk: "passive", costUnits: 2 },
  { id: "network.reverse_dns", name: "Reverse DNS", category: "network", description: "Resuelve punteros PTR para mapear IPs a hostnames.", requiredPlan: "free", risk: "passive", costUnits: 1 },
  { id: "dns.propagation", name: "DNS Propagation", category: "dns", description: "Compara respuestas de resolución global en tiempo real.", requiredPlan: "pro", risk: "passive", costUnits: 4 },
  { id: "dns.zone", name: "Zone Analysis", category: "dns", description: "Auditoría integral SOA, NS, DNSSEC y records comunes.", requiredPlan: "business", risk: "passive", costUnits: 4 },
  { id: "network.ping", name: "Ping Diagnostics", category: "network", description: "Mide latencia y alcance con paquetes ICMP seguros.", requiredPlan: "free", risk: "active-safe", costUnits: 1 },
  { id: "network.traceroute", name: "Traceroute", category: "network", description: "Traza el salto de red de paquetes hasta el objetivo.", requiredPlan: "pro", risk: "active-safe", costUnits: 3 },
  { id: "network.asn", name: "ASN Lookup", category: "network", description: "Encuentra metadatos del Sistema Autónomo del bloque IP.", requiredPlan: "free", risk: "passive", costUnits: 1 },
  { id: "osint.whois", name: "WHOIS / RDAP", category: "osint", description: "Obtiene información de registro y propiedad legal.", requiredPlan: "free", risk: "passive", costUnits: 2 },
  { id: "threat.ip_reputation", name: "IP Reputation", category: "threat", description: "Cruza IPs con feeds globales de spam y reputación.", requiredPlan: "business", risk: "passive", costUnits: 4 },
  { id: "network.geoip", name: "GeoIP Lookup", category: "network", description: "Localiza geografía, proveedor e ISP de una IP.", requiredPlan: "free", risk: "passive", costUnits: 1 },
  { id: "network.port_scan", name: "Port Scanner", category: "network", description: "Escanea puertos expuestos y servicios en ejecución.", requiredPlan: "business", risk: "active-intrusive", costUnits: 8 },
  { id: "tls.scan", name: "TLS Scanner", category: "ssl-tls", description: "Inspecciona fuerza criptográfica de certificados SSL/TLS.", requiredPlan: "free", risk: "active-safe", costUnits: 2 },
  { id: "website.headers", name: "HTTP Headers", category: "website", description: "Audita cabeceras de respuesta HTTP de forma segura.", requiredPlan: "free", risk: "active-safe", costUnits: 1 },
  { id: "network.cdn", name: "CDN Detection", category: "network", description: "Detecta proveedores Cloudflare, Akamai o Fastly.", requiredPlan: "pro", risk: "passive", costUnits: 2 },
  { id: "network.waf", name: "WAF Detection", category: "network", description: "Detecta cortafuegos de aplicaciones web de forma pasiva.", requiredPlan: "business", risk: "active-safe", costUnits: 3 },
  { id: "website.security_headers", name: "Security Headers", category: "website", description: "Evalúa políticas HSTS, CSP, X-Frame-Options y más.", requiredPlan: "free", risk: "active-safe", costUnits: 2 },
  { id: "website.tech_stack", name: "Tech Stack fingerprinting", category: "website", description: "Identifica tecnologías de servidor, CMS y frameworks.", requiredPlan: "pro", risk: "active-safe", costUnits: 3 },
  { id: "website.redirects", name: "Redirect Analysis", category: "website", description: "Sigue cadenas de redirección y analiza cabeceras Location.", requiredPlan: "free", risk: "active-safe", costUnits: 2 },
  { id: "website.cookies", name: "Cookie Analysis", category: "website", description: "Analiza flags Secure, HttpOnly y SameSite de cookies.", requiredPlan: "free", risk: "active-safe", costUnits: 2 }
];

const categoryMetadata: Record<ToolCategory, { label: string; icon: LucideIcon }> = {
  dns: { label: "DNS", icon: Layers },
  network: { label: "Redes", icon: Activity },
  "email-security": { label: "Email", icon: Mail },
  website: { label: "Web", icon: Globe },
  "ssl-tls": { label: "Cripto", icon: Key },
  threat: { label: "Amenazas", icon: ShieldAlert },
  osint: { label: "OSINT", icon: SearchIcon },
  ai: { label: "AI", icon: Cpu }
};

const planStyles: Record<string, string> = {
  free: "bg-zinc-800/80 text-zinc-400 border-zinc-700/50",
  pro: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  business: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  enterprise: "bg-blue-500/10 text-blue-400 border-blue-500/20"
};

const riskStyles: Record<ToolRisk, { bg: string; text: string; label: string }> = {
  passive: { bg: "bg-emerald-500/5 border-emerald-500/10", text: "text-emerald-400", label: "Pasivo" },
  "active-safe": { bg: "bg-yellow-500/5 border-yellow-500/10", text: "text-yellow-400", label: "Activo Seguro" },
  "active-intrusive": { bg: "bg-red-500/5 border-red-500/10", text: "text-red-400", label: "Activo Intrusivo" }
};

export default function ToolCatalog() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<ToolCategory | "all">("all");
  
  const selectedToolId = useIntelligenceStore((s: IntelligenceState) => s.selectedToolId);
  const selectTool = useIntelligenceStore((s: IntelligenceState) => s.selectTool);

  const filteredTools = useMemo(() => {
    return UI_TOOLS.filter((tool) => {
      const matchesSearch = 
        tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tool.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tool.id.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesCategory = selectedCategory === "all" || tool.category === selectedCategory;
      
      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, selectedCategory]);

  return (
    <div className="flex flex-col h-full bg-[#09090b] border border-[#1f1f23] rounded-2xl overflow-hidden shadow-2xl">
      {/* Search Header */}
      <div className="p-4 border-b border-[#1f1f23] space-y-3 bg-[#0c0c0e]">
        <div className="flex items-center space-x-2">
          <Compass className="w-4 h-4 text-emerald-400 animate-pulse" />
          <h3 className="text-xs font-semibold text-[#e4e4e7] tracking-wider uppercase font-mono">
            Catálogo de Herramientas
          </h3>
        </div>
        
        <div className="relative flex items-center">
          <Search className="absolute left-3 w-4 h-4 text-[#52525b]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar herramienta, puerto, spf..."
            className="w-full bg-[#141416] border border-[#27272a] rounded-xl pl-9 pr-4 py-2 text-xs text-[#e4e4e7] placeholder-[#52525b] focus:border-[#3f3f46] focus:ring-0 outline-none transition-all"
          />
        </div>
      </div>

      {/* Categories Toolbar */}
      <div className="flex px-4 py-3 overflow-x-auto border-b border-[#1f1f23] bg-[#0c0c0e]/50 gap-2 scrollbar-none">
        <button
          onClick={() => setSelectedCategory("all")}
          className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg border text-[11px] font-mono tracking-wide uppercase transition-all shrink-0 ${
            selectedCategory === "all"
              ? "bg-zinc-100 text-zinc-950 border-zinc-100 font-semibold"
              : "bg-[#141416] border-[#27272a] text-[#a1a1aa] hover:text-[#e4e4e7]"
          }`}
        >
          Todos
        </button>

        {Object.entries(categoryMetadata).map(([key, value]) => {
          const CatIcon = value.icon;
          return (
            <button
              key={key}
              onClick={() => setSelectedCategory(key as ToolCategory)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-mono tracking-wide uppercase transition-all shrink-0 ${
                selectedCategory === key
                  ? "bg-zinc-100 text-zinc-950 border-zinc-100 font-semibold"
                  : "bg-[#141416] border-[#27272a] text-[#a1a1aa] hover:text-[#e4e4e7]"
              }`}
            >
              <CatIcon className="w-3 h-3" />
              <span>{value.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tool List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2.5 bg-[#09090b] scrollbar-thin">
        {filteredTools.length > 0 ? (
          filteredTools.map((tool) => {
            const isSelected = selectedToolId === tool.id;
            const riskConfig = riskStyles[tool.risk];
            
            return (
              <div
                key={tool.id}
                onClick={() => selectTool(isSelected ? null : tool.id)}
                className={`relative flex flex-col p-3.5 border rounded-xl cursor-pointer group transition-all duration-300 ${
                  isSelected
                    ? "bg-[#18181b] border-emerald-500/30 shadow-lg shadow-emerald-950/10"
                    : "bg-[#0c0c0e]/60 border-[#1f1f23] hover:border-[#27272a] hover:bg-[#0e0e11]"
                }`}
              >
                {/* Active Indicator Bar */}
                {isSelected && (
                  <div className="absolute top-0 left-0 bottom-0 w-1 rounded-l-xl bg-emerald-500" />
                )}

                <div className="flex items-start justify-between w-full mb-1">
                  <span className="text-xs font-semibold text-[#e4e4e7] group-hover:text-emerald-400 transition-colors">
                    {tool.name}
                  </span>
                  
                  {/* SaaS Plan Badge */}
                  <span className={`text-[9px] font-mono font-medium border rounded px-1.5 py-0.5 tracking-wider uppercase ${planStyles[tool.requiredPlan]}`}>
                    {tool.requiredPlan}
                  </span>
                </div>

                <p className="text-[11px] text-[#71717a] leading-relaxed mb-3 pr-2">
                  {tool.description}
                </p>

                {/* Badges Footer */}
                <div className="flex items-center justify-between border-t border-[#1f1f23]/40 pt-2.5 mt-auto">
                  <div className="flex items-center space-x-2">
                    {/* Risk Badge */}
                    <span className={`text-[9px] font-mono border rounded-md px-1.5 py-0.5 ${riskConfig.bg} ${riskConfig.text}`}>
                      {riskConfig.label}
                    </span>

                    {/* Cost Badge */}
                    <span className="text-[9px] font-mono text-[#52525b]">
                      Coste: <strong className="text-[#a1a1aa] font-medium">{tool.costUnits} U</strong>
                    </span>
                  </div>

                  <span className="text-[9px] font-mono text-[#52525b] tracking-wider group-hover:text-[#a1a1aa] transition-colors">
                    {tool.id}
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center h-48 border border-dashed border-[#27272a] rounded-xl text-center p-4">
            <Terminal className="w-6 h-6 text-[#52525b] mb-2 animate-pulse" />
            <p className="text-xs font-medium text-[#71717a]">
              No se encontraron herramientas
            </p>
            <p className="text-[10px] text-[#52525b] mt-1 max-w-[200px]">
              Intenta buscando con palabras clave o seleccionando otra categoría.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
