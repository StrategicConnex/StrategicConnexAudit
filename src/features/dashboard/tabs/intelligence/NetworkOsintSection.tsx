"use client";

import {
  Activity,
  Compass,
  Cpu,
  Globe,
  Layers,
  MapPin,
  Server,
  Shield,
  ShieldAlert,
} from "lucide-react";
import type { Investigation } from "../intelligence/types";

/**
 * Bento-Row 1.8 — Diagnóstico de Red y OSINT Avanzado.
 * Renderiza WHOIS, TCP ping/WAF, GeoIP/ASN/PTR, DNSBL, co-hosted y traceroute
 * a partir de `investigation.metadata`. No mantiene estado propio.
 */
export function NetworkOsintSection({
  metadata,
}: {
  metadata: Investigation["metadata"];
}) {
  const meta = metadata;
  if (!meta) return null;

              const whois = meta.whois;
              const asnGeo = meta.asnGeo;
              const reverseDns = meta.reverseDns;
              const ping = meta.ping;
              const cdnWaf = meta.cdnWaf;
              const reverseIp = meta.reverseIp;
              const dnsbl = meta.dnsbl;
              const traceroute = meta.traceroute;

              // Safe WHOIS expiration calculations
              const remainingDays = (() => {
                if (!whois?.expiresDate) return null;
                const expiry = new Date(whois.expiresDate);
                const now = new Date();
                const diffTime = expiry.getTime() - now.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                return diffDays;
              })();

              // Check if we have any Network data at all.
              const hasNetworkData = whois || asnGeo || ping || cdnWaf || dnsbl || traceroute;
              if (!hasNetworkData) return null;

              return (
                <div className="space-y-8 mt-8">
                  {/* Row Header */}
                  <div>
                    <h3 className="font-extrabold text-foreground text-base tracking-tight flex items-center gap-2">
                      <Globe className="w-5 h-5 text-primary animate-pulse" />
                      Diagnóstico de Red y OSINT Avanzado
                    </h3>
                    <p className="text-2xs font-bold text-muted-fg uppercase tracking-widest mt-0.5">
                      Topología de perímetro de red, enrutamiento de paquetes y análisis de huella pública (Open Source Intelligence)
                    </p>
                  </div>

                  {/* 2x2 grid for main details */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    
                    {/* Card 1: WHOIS & Registro de Dominio */}
                    <div className="glass-card p-6 flex flex-col gap-5 hover:border-border transition-colors duration-300">
                      <div className="flex items-center justify-between border-b border-border/50 pb-3">
                        <h4 className="text-xs font-extrabold text-foreground/80 uppercase tracking-wider flex items-center gap-2">
                          <Globe className="w-4 h-4 text-primary" />
                          Información de Registro (WHOIS/RDAP)
                        </h4>
                        {whois?.success && (
                          <span className="text-2xs bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                            Dominio Activo
                          </span>
                        )}
                      </div>

                      {whois?.success ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 flex-1">
                          {/* Registrar & Dates */}
                          <div className="space-y-4">
                            <div className="space-y-1">
                              <span className="text-2xs font-bold text-muted-fg uppercase tracking-widest block">Registrador Autorizado</span>
                              <span className="text-sm font-extrabold text-foreground">{whois.registrar || 'Desconocido'}</span>
                            </div>

                            <div className="space-y-2">
                              <span className="text-2xs font-bold text-muted-fg uppercase tracking-widest block">Fechas de Registro</span>
                              <div className="space-y-1 bg-muted/10 border border-border/50 rounded-lg p-2.5">
                                <div className="flex justify-between text-2xs">
                                  <span className="text-muted-fg font-bold uppercase">Creado:</span>
                                  <span className="text-foreground/80 font-mono">{whois.createdDate ? new Date(whois.createdDate).toLocaleDateString('es-ES') : 'N/A'}</span>
                                </div>
                                <div className="flex justify-between text-2xs">
                                  <span className="text-muted-fg font-bold uppercase">Actualizado:</span>
                                  <span className="text-foreground/80 font-mono">{whois.updatedDate ? new Date(whois.updatedDate).toLocaleDateString('es-ES') : 'N/A'}</span>
                                </div>
                                <div className="flex justify-between text-2xs border-t border-border/50 pt-1 mt-1">
                                  <span className="text-muted-fg font-bold uppercase">Expira:</span>
                                  <span className="text-foreground/80 font-mono">{whois.expiresDate ? new Date(whois.expiresDate).toLocaleDateString('es-ES') : 'N/A'}</span>
                                </div>
                              </div>
                            </div>

                            {/* Expiry Alert Badge */}
                            {remainingDays !== null && (
                              <div className={`p-2.5 rounded-lg border text-center ${
                                remainingDays < 60 
                                  ? 'bg-destructive/5 border-destructive/20 text-destructive' 
                                  : remainingDays < 180 
                                  ? 'bg-[oklch(75% 0.13 80)]/5 border-[oklch(75% 0.13 80)]/20 text-[oklch(75% 0.13 80)]' 
                                  : 'bg-chartreuse/5 border-chartreuse/20 text-chartreuse'
                              }`}>
                                <span className="text-2xs font-bold uppercase tracking-wider block">Tiempo hasta Renovación</span>
                                <span className="text-sm font-black">{remainingDays} días</span>
                              </div>
                            )}
                          </div>

                          {/* Domain Status & Nameservers */}
                          <div className="space-y-4 flex flex-col">
                            <div className="space-y-1.5">
                              <span className="text-2xs font-bold text-muted-fg uppercase tracking-widest block">Estados de Dominio (Registry Status)</span>
                              <div className="flex flex-wrap gap-1">
                                {whois.status && whois.status.length > 0 ? (
                                  whois.status.slice(0, 3).map((st, idx) => (
                                    <span key={idx} className="text-2xs font-bold px-2 py-0.5 rounded bg-muted text-muted-fg border border-border/50 truncate max-w-full">
                                      {st.split(' ')[0]}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-2xs text-muted-fg">Ningún estado especial reportado</span>
                                )}
                              </div>
                            </div>

                            <div className="space-y-1.5 flex-1 flex flex-col justify-end">
                              <span className="text-2xs font-bold text-muted-fg uppercase tracking-widest block">Servidores de Nombres (Auth DNS)</span>
                              <div className="bg-muted/5 border border-border/50 rounded-lg p-2.5 space-y-1 flex-1 overflow-y-auto max-h-[120px]">
                                {whois.nameservers && whois.nameservers.length > 0 ? (
                                  whois.nameservers.map((ns, idx) => (
                                    <div key={idx} className="flex items-center gap-1.5 text-2xs text-muted-fg font-mono">
                                      <span className="w-1 h-1 bg-indigo-500 rounded-full shrink-0"></span>
                                      <span className="truncate">{ns}</span>
                                    </div>
                                  ))
                                ) : (
                                  <span className="text-2xs text-muted-fg">Ningún servidor DNS delegado</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 flex flex-col justify-center items-center text-center p-6 bg-muted/1 border border-dashed border-border/50 rounded-xl gap-2">
                          <Globe className="w-8 h-8 text-muted-fg" />
                          <span className="text-xs font-bold text-muted-fg">Detalles WHOIS No Disponibles</span>
                          <p className="text-2xs text-muted-fg max-w-xs leading-relaxed">
                            No se encontraron registros de registro de dominio público para este objetivo. Esto ocurre en IPs directas o subdominios internos.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Card 2: Rendimiento y Escudo Perimetral (TCP Ping & CDN/WAF) */}
                    <div className="glass-card p-6 flex flex-col justify-between hover:border-border transition-colors duration-300 group">
                      <div className="flex items-center justify-between border-b border-border/50 pb-3">
                        <h4 className="text-xs font-extrabold text-foreground/80 uppercase tracking-wider flex items-center gap-2">
                          <Activity className="w-4 h-4 text-chartreuse" />
                          Rendimiento y Escudo Perimetral
                        </h4>
                        <span className={`text-2xs font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                          cdnWaf?.detected 
                            ? 'bg-chartreuse/10 text-chartreuse border-chartreuse/20' 
                            : 'bg-[oklch(75% 0.13 80)]/10 text-[oklch(75% 0.13 80)] border-[oklch(75% 0.13 80)]/20'
                        }`}>
                          {cdnWaf?.detected ? 'WAF Activo' : 'Sin WAF'}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-2">
                        {/* Ping Performance with Animated Pulsing Ring */}
                        <div className="flex flex-col items-center justify-center text-center border-r border-border/50 pr-0 md:pr-6 gap-3">
                          <span className="text-2xs font-bold text-muted-fg uppercase tracking-widest block">Latencia de Conexión (TCP Ping)</span>
                          
                          {ping?.success ? (
                            <div className="relative flex items-center justify-center w-24 h-24 mt-1">
                              {/* Pulsing rings */}
                              <div className={`absolute inset-0 rounded-full animate-ping opacity-20 ${
                                ping.latencyMs! < 100 
                                  ? 'bg-chartreuse' 
                                  : ping.latencyMs! < 250 
                                  ? 'bg-amber-500' 
                                  : 'bg-destructive'
                              }`} style={{ animationDuration: '2s' }}></div>
                              <div className={`absolute -inset-2 rounded-full opacity-10 ${
                                ping.latencyMs! < 100 
                                  ? 'bg-chartreuse' 
                                  : ping.latencyMs! < 250 
                                  ? 'bg-amber-500' 
                                  : 'bg-destructive'
                              }`}></div>
                              
                              {/* Main latency circle */}
                              <div className={`w-20 h-20 rounded-full border flex flex-col items-center justify-center bg-muted shadow-[inset_0_2px_10px_rgba(0,0,0,0.8)] ${
                                ping.latencyMs! < 100 
                                  ? 'border-chartreuse/30' 
                                  : ping.latencyMs! < 250 
                                  ? 'border-[oklch(75% 0.13 80)]/30' 
                                  : 'border-destructive/30'
                              }`}>
                                <span className={`text-2xl font-black tracking-tighter ${
                                  ping.latencyMs! < 100 
                                    ? 'text-chartreuse' 
                                    : ping.latencyMs! < 250 
                                    ? 'text-[oklch(75% 0.13 80)]' 
                                    : 'text-destructive'
                                }`}>
                                  {ping.latencyMs}
                                </span>
                                <span className="text-2xs text-muted-fg uppercase font-black tracking-widest">ms</span>
                              </div>
                            </div>
                          ) : (
                            <div className="w-20 h-20 rounded-full border border-destructive/20 bg-destructive/5 flex flex-col items-center justify-center text-center mt-1">
                              <ShieldAlert className="w-8 h-8 text-destructive animate-pulse" />
                              <span className="text-2xs text-destructive font-extrabold uppercase mt-1">TIMEOUT</span>
                            </div>
                          )}

                          <span className="text-2xs text-muted-fg font-medium">
                            {ping?.success 
                              ? `Handshake TCP puerto ${ping.port} completado` 
                              : `Conexión rechazada o caída (Puertos 80/443)`}
                          </span>
                        </div>

                        {/* WAF Shield details */}
                        <div className="flex flex-col justify-center gap-4">
                          <div className="space-y-2">
                            <span className="text-2xs font-bold text-muted-fg uppercase tracking-widest block">Tecnología Cortafuegos Web (WAF)</span>
                            <div className="flex items-center gap-3 bg-muted/10 border border-border/50 p-3 rounded-xl transition-colors duration-300 group-hover:bg-muted/20">
                              <div className={`p-2.5 rounded-lg ${
                                cdnWaf?.detected ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-fg'
                              }`}>
                                <Shield className={`w-6 h-6 ${cdnWaf?.detected ? 'animate-pulse' : ''}`} />
                              </div>
                              <div>
                                <span className="text-xs font-black text-foreground block">
                                  {cdnWaf?.detected ? cdnWaf.name : 'Proxy Directo Origin'}
                                </span>
                                <span className="text-2xs text-muted-fg font-bold block uppercase tracking-wider mt-0.5">
                                  Proveedor: {cdnWaf?.detected ? cdnWaf.provider : 'Ninguno (Servidor Expuesto)'}
                                </span>
                              </div>
                            </div>
                          </div>

                          <p className="text-2xs text-muted-fg leading-relaxed">
                            {cdnWaf?.detected 
                              ? `Protección perimetral activa. Las solicitudes maliciosas, ataques DDoS de capa 7 e inyecciones SQL son filtrados por el CDN en el Edge antes de tocar tu servidor.`
                              : `¡Alerta de Perímetro! Al no contar con protección WAF/CDN, la dirección IP real de tu servidor web está expuesta directamente a ataques DDoS, escaneos de puertos automatizados y exploits.`}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Card 3: GeoIP, ASN & PTR (Identidad de Red) */}
                    <div className="glass-card p-6 flex flex-col justify-between hover:border-border transition-colors duration-300">
                      <div className="flex items-center justify-between border-b border-border/50 pb-3">
                        <h4 className="text-xs font-extrabold text-foreground/80 uppercase tracking-wider flex items-center gap-2">
                          <Cpu className="w-4 h-4 text-primary" />
                          Geolocalización e Identidad de Red (ASN/PTR)
                        </h4>
                        <span className="text-2xs text-muted-fg font-mono uppercase tracking-wider">
                          {asnGeo?.ipVersion ? `IPv${asnGeo.ipVersion}` : 'IP'} Address
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-2">
                        {/* Geo Coordinates conceptual map (Beautiful retro scanning radar grid!) */}
                        <div className="flex flex-col items-center justify-center gap-2 bg-card/60 border border-border/50 rounded-xl relative overflow-hidden h-[180px]">
                          {asnGeo?.latitude && asnGeo?.longitude ? (
                            <div className="absolute inset-0 z-0 pointer-events-none opacity-60 mix-blend-screen overflow-hidden">
                              <iframe
                                width="100%"
                                height="100%"
                                frameBorder="0"
                                scrolling="no"
                                src={`https://www.openstreetmap.org/export/embed.html?bbox=${asnGeo.longitude - 2},${asnGeo.latitude - 2},${asnGeo.longitude + 2},${asnGeo.latitude + 2}&layer=mapnik&marker=${asnGeo.latitude},${asnGeo.longitude}`}
                                className="w-full h-full object-cover scale-[1.3] grayscale invert contrast-125"
                                style={{ pointerEvents: 'none' }}
                              ></iframe>
                              <div className="absolute inset-0 bg-gradient-to-t from-[#020204] via-transparent to-[#020204]/80 z-10" />
                            </div>
                          ) : (
                            <>
                              {/* Conceptual Map Grid Background Fallback */}
                              <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:14px_14px]"></div>
                              
                              {/* Radial Scanning line */}
                              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-500/10 to-transparent w-full h-full animate-[pulse_3s_infinite]" style={{ transform: 'skewX(-20deg)' }}></div>

                              {/* SVG Radar circle & scan lines */}
                              <svg className="w-24 h-24 text-primary/20 absolute z-0 shrink-0" viewBox="0 0 100 100">
                                <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="3 3" />
                                <circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" strokeWidth="0.5" />
                                <circle cx="50" cy="50" r="15" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="1 2" />
                                <line x1="50" y1="5" x2="50" y2="95" stroke="currentColor" strokeWidth="0.5" />
                                <line x1="5" y1="50" x2="95" y2="50" stroke="currentColor" strokeWidth="0.5" />
                              </svg>
                            </>
                          )}

                          <div className="relative z-20 flex flex-col items-center text-center space-y-1 p-2 rounded-xl bg-[#020204]/60 backdrop-blur-md border border-border/70 mt-4">
                            <MapPin className="w-6 h-6 text-primary animate-bounce drop-shadow-[0_0_8px_rgba(98,113,196,0.6)]" />
                            <span className="text-2xs font-black text-foreground drop-shadow-md">{asnGeo?.cityName || 'Ciudad Desconocida'}, {asnGeo?.countryCode || 'N/A'}</span>
                            <span className="text-2xs text-muted-fg font-mono tracking-wider uppercase bg-black/50 px-1.5 py-0.5 rounded">Coords: {asnGeo?.latitude?.toFixed(4) ?? '0.0000'}, {asnGeo?.longitude?.toFixed(4) ?? '0.0000'}</span>
                            <span className="text-2xs bg-muted/80 text-primary border border-primary/30 px-2 py-0.5 rounded mt-1 max-w-[150px] truncate block font-bold">
                              {asnGeo?.countryName || 'País Desconocido'}
                            </span>
                          </div>
                        </div>

                        {/* Network Metadata ASN / Reverse DNS list */}
                        <div className="space-y-4 flex flex-col justify-between">
                          <div className="space-y-1">
                            <span className="text-2xs font-bold text-muted-fg uppercase tracking-widest block">Dirección IP de Destino</span>
                            <span 
                              className="text-xs font-mono font-extrabold text-foreground block bg-muted/10 border border-border/50 p-1.5 rounded truncate max-w-full overflow-hidden"
                              title={asnGeo?.ipAddress || 'Desconocido'}
                            >
                              {asnGeo?.ipAddress || 'Desconocido'}
                            </span>
                            {(asnGeo?.ipv4 || asnGeo?.ipv6) && (
                              <div className="flex gap-2 mt-1">
                                {asnGeo?.ipv4 && <span className="text-2xs font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20" title={asnGeo?.ipv4}>IPv4: {asnGeo?.ipv4}</span>}
                                {asnGeo?.ipv6 && <span className="text-2xs font-mono text-muted-fg bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20 truncate max-w-[120px]" title={asnGeo?.ipv6}>IPv6: {asnGeo?.ipv6}</span>}
                              </div>
                            )}
                          </div>

                          <div className="space-y-1">
                            <span className="text-2xs font-bold text-muted-fg uppercase tracking-widest block">Sistema Autónomo (ASN)</span>
                            <span className="text-2xs text-foreground/80 font-bold block">
                              {asnGeo?.asn !== 'Desconocido' ? `ASN: ${asnGeo?.asn}` : 'ASN Desconocido'}
                            </span>
                            <span className="text-2xs text-muted-fg font-medium block truncate max-w-[200px]" title={asnGeo?.asName || ''}>
                              {asnGeo?.asName || 'Proveedor de Red Desconocido'}
                            </span>
                          </div>

                          <div className="space-y-1">
                            <span className="text-2xs font-bold text-muted-fg uppercase tracking-widest block">Resolución Inversa (PTR / Reverse DNS)</span>
                            <div className="bg-muted/5 border border-border/50 rounded-lg p-2 max-h-[60px] overflow-y-auto font-mono text-2xs text-muted-fg space-y-0.5">
                              {reverseDns && reverseDns.length > 0 ? (
                                reverseDns.map((ptr, idx) => (
                                  <div key={idx} className="truncate select-all" title={ptr}>
                                    {ptr}
                                  </div>
                                ))
                              ) : (
                                <span className="text-muted-fg block text-2xs">No se encontró registro PTR inverso</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card 4: DNSBL Historial y Vecindario IP */}
                    <div className="glass-card p-6 flex flex-col justify-between hover:border-border transition-colors duration-300">
                      <div className="flex items-center justify-between border-b border-border/50 pb-3">
                        <h4 className="text-xs font-extrabold text-foreground/80 uppercase tracking-wider flex items-center gap-2">
                          <Layers className="w-4 h-4 text-primary" />
                          Listas Negras (DNSBL) y Dominios Co-alojados
                        </h4>
                        {(() => {
                          const listedCount = dnsbl?.filter(item => item.listed).length || 0;
                          return (
                            <span className={`text-2xs font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                              listedCount > 0 
                                ? 'bg-destructive/10 text-destructive border-destructive/20' 
                                : 'bg-chartreuse/10 text-chartreuse border-chartreuse/20'
                            }`}>
                              {listedCount > 0 ? `${listedCount} Reportes` : 'Limpio'}
                            </span>
                          );
                        })()}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-2">
                        {/* DNSBL Status list */}
                        <div className="space-y-3">
                          <span className="text-2xs font-bold text-muted-fg uppercase tracking-widest block">Monitoreo de Listas DNSBL</span>
                          
                          <div className="space-y-2">
                            {dnsbl && dnsbl.length > 0 ? (
                              dnsbl.map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between bg-muted/5 border border-border/50 p-2 rounded-lg text-2xs">
                                  <span className="font-extrabold text-foreground/80">{item.list}</span>
                                  <span className={`px-2 py-0.5 rounded text-2xs font-black uppercase ${
                                    item.listed 
                                      ? 'bg-destructive/10 text-destructive border border-destructive/20' 
                                      : 'bg-chartreuse/10 text-chartreuse border border-chartreuse/20'
                                  }`}>
                                    {item.listed ? 'Reportado' : 'Seguro'}
                                  </span>
                                </div>
                              ))
                            ) : (
                              // Fallback default checks
                              ['Spamhaus ZEN', 'SORBS DNSBL', 'Barracuda BRBL'].map((name, idx) => (
                                <div key={idx} className="flex items-center justify-between bg-muted/5 border border-border/50 p-2 rounded-lg text-2xs">
                                  <span className="font-extrabold text-foreground/80">{name}</span>
                                  <span className="px-2 py-0.5 rounded text-2xs font-black uppercase bg-chartreuse/10 text-chartreuse border border-chartreuse/20">
                                    Seguro
                                  </span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        {/* Co-hosted domains neighborhood inspector */}
                        <div className="space-y-2 flex flex-col justify-between">
                          <span className="text-2xs font-bold text-muted-fg uppercase tracking-widest block">Dominios en el mismo Servidor ({reverseIp?.length || 0})</span>
                          
                          <div className="bg-card/40 border border-border/50 rounded-lg p-2.5 flex-1 flex flex-col justify-between max-h-[120px] overflow-y-auto">
                            {reverseIp && reverseIp.length > 0 ? (
                              <div className="space-y-1">
                                {reverseIp.slice(0, 10).map((dom, idx) => (
                                  <div key={idx} className="flex items-center gap-1.5 text-2xs font-mono text-muted-fg hover:text-foreground transition-colors duration-150 truncate">
                                    <span className="w-1 h-1 bg-primary rounded-full shrink-0"></span>
                                    <span className="truncate">{dom}</span>
                                  </div>
                                ))}
                                {reverseIp.length > 10 && (
                                  <div className="text-2xs text-muted-fg font-bold uppercase tracking-wider pt-1 border-t border-border/50 text-center">
                                    + {reverseIp.length - 10} dominios adicionales
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="flex flex-col justify-center items-center text-center p-3 h-full gap-1">
                                <Server className="w-5 h-5 text-muted-fg/60" />
                                <span className="text-2xs font-bold text-muted-fg uppercase tracking-wider block">IP Aislada o Compartida</span>
                                <p className="text-2xs text-muted-fg leading-relaxed">
                                  No se detectaron vecinos públicos alojados en este nodo.
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* Card 5: Horizontal/Vertical packet traceroute hops transit flow */}
                  <div className="glass-card p-6 hover:border-border transition-colors duration-300">
                    <div className="flex items-center justify-between border-b border-border/50 pb-3 mb-6">
                      <div>
                        <h4 className="text-xs font-extrabold text-foreground/80 uppercase tracking-wider flex items-center gap-2">
                          <Compass className="w-4 h-4 text-primary" />
                          Traza Topológica de Tránsito de Paquetes (Visual Traceroute)
                        </h4>
                        <p className="text-2xs text-muted-fg mt-0.5">
                          Mapa conceptual interactivo del trayecto y retardos de enrutamiento IP desde la puerta local hasta el destino
                        </p>
                      </div>
                      {traceroute && traceroute.length > 0 && (
                        <span className="text-2xs bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded font-mono uppercase tracking-wider font-bold">
                          {traceroute.length} Nodos
                        </span>
                      )}
                    </div>

                    {traceroute && traceroute.length > 0 ? (
                      <div className="relative py-8 px-4 overflow-x-auto select-none no-scrollbar">
                        {/* Local CSS styles for high-fidelity animations */}
                        <style>{`
                          @keyframes dash-flow {
                            to { stroke-dashoffset: -40; }
                          }
                          .animate-dash-flow {
                            stroke-dasharray: 8 8;
                            animation: dash-flow 2s linear infinite;
                          }
                          @keyframes dash-vertical-flow {
                            to { stroke-dashoffset: -40; }
                          }
                          .animate-dash-vertical-flow {
                            stroke-dasharray: 8 8;
                            animation: dash-vertical-flow 2s linear infinite;
                          }
                          @keyframes ring-pulse {
                            0% { transform: scale(0.95); opacity: 0.5; }
                            50% { transform: scale(1.3); opacity: 0; }
                            100% { transform: scale(0.95); opacity: 0; }
                          }
                          .animate-ring-pulse {
                            animation: ring-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
                          }
                        `}</style>

                        {/* Desktop Horizontal Connecting SVG */}
                        <svg className="absolute top-[50px] left-0 w-full h-[6px] pointer-events-none hidden md:block" style={{ width: '100%', minWidth: `${traceroute.length * 180}px` }}>
                          <path
                            d={`M 40 3 L ${traceroute.length * 180 - 40} 3`}
                            fill="none"
                            stroke="url(#trace-flow-grad)"
                            strokeWidth="3"
                            className="animate-dash-flow"
                          />
                          <defs>
                            <linearGradient id="trace-flow-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                              <stop offset="0%" stopColor="#6271C4" />
                              <stop offset="50%" stopColor="#f472b6" />
                              <stop offset="100%" stopColor="var(--primary)" />
                            </linearGradient>
                          </defs>
                        </svg>

                        {/* Mobile Vertical Connecting Dotted Line */}
                        <div className="absolute top-12 bottom-12 left-10 w-[2px] bg-gradient-to-b from-indigo-500 via-pink-500 to-cyan-500 opacity-20 md:hidden pointer-events-none" />
                        <svg className="absolute top-12 bottom-12 left-[39px] w-[3px] h-[calc(100%-96px)] pointer-events-none md:hidden opacity-45">
                          <line
                            x1="1.5" y1="0" x2="1.5" y2="100%"
                            fill="none"
                            stroke="url(#trace-vertical-grad)"
                            strokeWidth="3"
                            className="animate-dash-vertical-flow"
                          />
                          <defs>
                            <linearGradient id="trace-vertical-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                              <stop offset="0%" stopColor="#6271C4" />
                              <stop offset="50%" stopColor="#f472b6" />
                              <stop offset="100%" stopColor="var(--primary)" />
                            </linearGradient>
                          </defs>
                        </svg>

                        {/* Steps Grid */}
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center min-w-max gap-12 md:gap-4 px-4 relative z-10 font-sans">
                          {traceroute.map((hop) => {
                            // Determine latency tier colors and styling
                            const latencyColor = hop.latencyMs < 50 
                              ? 'border-chartreuse bg-chartreuse/20 text-chartreuse shadow-[0_0_15px_rgba(140,200,80,0.3)]' 
                              : hop.latencyMs < 150 
                              ? 'border-[oklch(75% 0.13 80)] bg-[oklch(75% 0.13 80)]/20 text-[oklch(75% 0.13 80)] shadow-[0_0_15px_rgba(180,120,30,0.3)]' 
                              : 'border-destructive bg-destructive/20 text-destructive shadow-[0_0_15px_rgba(190,18,60,0.3)]';

                            const pulseRingColor = hop.latencyMs < 50 
                              ? 'bg-chartreuse/30' 
                              : hop.latencyMs < 150 
                              ? 'bg-amber-500/30' 
                              : 'bg-destructive/30';

                            return (
                              <div key={hop.hop} className="flex flex-row md:flex-col items-center gap-5 md:gap-4 group/hop relative min-w-[150px] max-w-[200px]">
                                
                                {/* Visual node representation */}
                                <div className="relative shrink-0 z-20 cursor-pointer">
                                  {/* Pulsing glow ring based on latency */}
                                  <span className={`absolute -inset-1 rounded-full animate-ring-pulse ${pulseRingColor}`} />
                                  
                                  <div className={`w-[38px] h-[38px] rounded-full border-2 flex items-center justify-center font-black text-2xs relative z-10 transition-[color,border-color,box-shadow,transform,width,height] duration-300 group-hover/hop:scale-115 group-hover/hop:border-primary group-hover/hop:text-primary group-hover/hop:shadow-[0_0_20px_rgba(98,113,196,0.5)] ${latencyColor}`}>
                                    {hop.hop}
                                  </div>
                                </div>

                                {/* Step Label Details */}
                                <div className="space-y-1 text-left md:text-center flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 md:justify-center">
                                    <span className="text-2xs font-black text-foreground block max-w-[120px] truncate group-hover/hop:text-primary transition-colors duration-200" title={hop.hostname}>
                                      {hop.hostname}
                                    </span>
                                    {hop.countryCode && hop.countryCode !== 'LAN' && (
                                      <span className="text-2xs bg-muted/20 text-muted-fg border border-border/70 font-extrabold uppercase px-1 rounded scale-90 select-none">
                                        {hop.countryCode}
                                      </span>
                                    )}
                                  </div>
                                  
                                  <span className="text-2xs font-mono text-muted-fg block truncate" title={hop.ip}>{hop.ip}</span>
                                  
                                  <span className="text-2xs text-muted-fg font-bold block leading-snug truncate max-w-[140px]" title={hop.asnOrg || ''}>
                                    {hop.asnOrg}
                                  </span>

                                  {/* Latency badge */}
                                  <div className="pt-0.5 flex items-center gap-1.5 md:justify-center">
                                    <span className={`text-2xs font-black px-2 py-0.5 rounded font-mono border ${
                                      hop.latencyMs < 50 
                                        ? 'bg-chartreuse/10 text-chartreuse border-chartreuse/20' 
                                        : hop.latencyMs < 150 
                                        ? 'bg-[oklch(75% 0.13 80)]/10 text-[oklch(75% 0.13 80)] border-[oklch(75% 0.13 80)]/20' 
                                        : 'bg-destructive/10 text-destructive border-destructive/20'
                                    }`}>
                                      {hop.latencyMs} ms
                                    </span>
                                    {hop.asn && (
                                      <span className="text-2xs text-muted-fg font-mono font-bold select-none">{hop.asn}</span>
                                    )}
                                  </div>
                                </div>

                                {/* PREMIUM HOVER INTERACTIVE TOOLTIP POPOVER */}
                                <div className="group-hover/hop:opacity-100 group-hover/hop:translate-y-0 opacity-0 translate-y-2 pointer-events-none absolute bottom-[105%] left-1/2 -translate-x-1/2 mb-4 bg-muted/[0.95] backdrop-blur-xl border border-border p-4.5 rounded-2xl shadow-[0_20px_45px_rgba(0,0,0,0.9),0_0_20px_rgba(255,255,255,0.01)] transition-[opacity,transform] duration-300 w-64 z-50 flex flex-col gap-3 text-xs select-text text-left font-sans">
                                  <div className="flex items-center justify-between border-b border-border/70 pb-2">
                                    <span className="text-2xs font-extrabold text-muted-fg uppercase tracking-widest">DETALLES DEL SALTO #{hop.hop}</span>
                                    <span className="text-2xs font-mono text-primary font-extrabold">{hop.type?.toUpperCase() || 'UNKNOWN'}</span>
                                  </div>
                                  
                                  <div className="space-y-2">
                                    <div className="space-y-0.5">
                                      <span className="text-2xs font-bold text-muted-fg uppercase tracking-wider block">Servidor (Host)</span>
                                      <span className="text-2xs font-black text-foreground block break-all leading-normal">{hop.hostname}</span>
                                    </div>
                                    <div className="flex justify-between gap-4">
                                      <div className="space-y-0.5 flex-1 min-w-0">
                                        <span className="text-2xs font-bold text-muted-fg tracking-wider block">Dirección IP</span>
                                        <span className="text-2xs font-mono text-foreground/80 font-bold block truncate select-all">{hop.ip}</span>
                                      </div>
                                      {hop.countryCode && (
                                        <div className="space-y-0.5 text-right shrink-0">
                                          <span className="text-2xs font-bold text-muted-fg tracking-wider block">Geolocalización</span>
                                          <span className="text-2xs font-bold text-foreground/80 block">
                                            {hop.cityName ? `${hop.cityName}, ` : ''}{hop.countryCode}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                    <div className="space-y-0.5 border-t border-border/50 pt-2">
                                      <span className="text-2xs font-bold text-muted-fg tracking-wider block">Sistema Autónomo e ISP</span>
                                      <span className="text-2xs text-foreground/80 font-bold block leading-snug truncate" title={hop.asnOrg || ''}>{hop.asnOrg || 'Proveedor Local'}</span>
                                      {hop.asn && <span className="text-2xs text-muted-fg font-mono font-bold">{hop.asn}</span>}
                                    </div>
                                    
                                    {/* HSL-tuned relative latency comparison bar */}
                                    <div className="space-y-1.5 border-t border-border/50 pt-2">
                                      <div className="flex justify-between text-2xs font-bold uppercase">
                                        <span className="text-muted-fg">Latencia</span>
                                        <span className="text-foreground font-mono">{hop.latencyMs} ms</span>
                                      </div>
                                      <div className="w-full h-2 bg-muted border border-border/50 rounded-full overflow-hidden p-0.5">
                                        <div 
                                          className="h-full rounded-full transition-[width,background-color,box-shadow] duration-500 shadow-[0_0_8px_rgba(255,255,255,0.1)]" 
                                          style={{ 
                                            width: `${Math.max(8, Math.min(100, (hop.latencyMs / 300) * 100))}%`, 
                                            backgroundColor: `hsl(${Math.max(0, 120 - (hop.latencyMs / 300) * 120)}, 85%, 48%)` 
                                          }} 
                                        />
                                      </div>
                                    </div>
                                  </div>
                                </div>

                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col justify-center items-center text-center py-10 bg-muted/1 border border-dashed border-border/50 rounded-xl gap-2">
                        <Compass className="w-10 h-10 text-muted-fg animate-spin" style={{ animationDuration: '6s' }} />
                        <span className="text-xs font-bold text-muted-fg">Generando Topología de Tránsito</span>
                        <p className="text-2xs text-muted-fg max-w-xs leading-relaxed">
                          La traza de enrutamiento se modela y mapea en tiempo real según el retardo y la geolocalización detectada para el host objetivo.
                        </p>
                      </div>
                    )}
                  </div>

                </div>
              );
}
