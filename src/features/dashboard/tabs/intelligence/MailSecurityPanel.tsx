'use client';

import { useTranslations } from 'next-intl';
import {
  AlertTriangle, Check, ChevronDown, Copy, Cpu, Lock, Mail, Server, Shield, Terminal,
} from 'lucide-react';
import type { Finding, IntelligenceMetadata } from './types';

interface MailSecurityPanelProps {
  metadata: IntelligenceMetadata | null;
  target: string;
  findings: Finding[];
  expandedAccordions: Record<string, boolean>;
  onToggleAccordion: (id: string) => void;
  copiedId: string | null;
  onCopy: (text: string, id?: string) => void;
}

/**
 * Bento-Row 1.5 del detalle de investigación: autenticación de correo
 * (SPF/DMARC/DKIM/BIMI) y seguridad web (TLS + cabeceras).
 * Extraído del monolito IntelligenceTab.
 */
export function MailSecurityPanel({
  metadata: meta,
  target,
  findings,
  expandedAccordions,
  onToggleAccordion,
  copiedId,
  onCopy,
}: MailSecurityPanelProps) {
  const t = useTranslations('intelligence');
  const mailScore = meta?.mailHealthCompositeScore ?? null;
  const infraScore = meta?.infrastructureScore ?? null;

  return (
    <div className="glass-card p-8 flex flex-col gap-6">
      <div>                        <h3 className="font-extrabold text-foreground text-base tracking-tight flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              {t('emailWebSecurity')}
            </h3>
            <p className="text-[10px] font-bold text-muted-fg uppercase tracking-widest mt-0.5">
              {t('scanSubtitle')}
            </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 border-t border-border/50 pt-6">

        {/* Left Column: Mail Security & Deliverability */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-extrabold text-foreground/80 uppercase tracking-wider flex items-center gap-2">
              <Mail className="w-4 h-4 text-primary" />
              Autenticación de Correo y Reputación
            </h4>
            {mailScore !== null && (
              <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                mailScore >= 80 ? 'text-chartreuse border-chartreuse/20 bg-chartreuse/5' : 'text-destructive border-destructive/20 bg-destructive/5'
              }`}>
                Score: {mailScore}/100
              </span>
            )}
          </div>

          <div className="space-y-4">
            {/* SPF Accordion Card */}
            <div className="bg-muted/[0.4] border border-border backdrop-blur-xl hover:border-primary/20 rounded-xl overflow-hidden transition-colors duration-300">
              <button
                type="button"
                onClick={() => onToggleAccordion('spf')}
                className="w-full flex items-center justify-between p-4 cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/40 hover:bg-muted/10 transition-colors"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-extrabold text-foreground/80 uppercase tracking-widest">
                    SPF (Sender Policy Framework)
                  </span>
                  <span className="text-[9px] text-muted-fg font-medium">Verificación del registro TXT en DNS</span>
                </div>
                <div className="flex items-center gap-3">
                  {meta?.spfParsed ? (
                    <span className={`text-[9px] font-bold px-2.5 py-0.5 rounded ${
                      meta.spfParsed.isWeak
                        ? 'bg-[oklch(75% 0.13 80)]/10 text-[oklch(75% 0.13 80)] border border-[oklch(75% 0.13 80)]/20'
                        : 'bg-chartreuse/10 text-chartreuse border border-chartreuse/20'
                    }`}>
                      {meta.spfParsed.isWeak ? 'Vulnerable' : 'Seguro'}
                    </span>
                  ) : (
                    <span className="text-[9px] bg-destructive/10 text-destructive border border-destructive/20 px-2.5 py-0.5 rounded font-bold">
                      No Configurado
                    </span>
                  )}
                  <ChevronDown className={`w-4 h-4 text-muted-fg transition-transform duration-300 ${expandedAccordions['spf'] ? 'rotate-180 text-primary' : ''}`} />
                </div>
              </button>

              {/* Smooth transition container */}
              <div className={`transition-[max-height,border-color] duration-300 ease-in-out overflow-hidden ${expandedAccordions['spf'] ? 'max-h-[600px] border-t border-border' : 'max-h-0'}`}>
                <div className="p-5 space-y-4 text-xs bg-muted/20">
                  {meta?.spfParsed ? (
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <span className="text-[8px] font-bold text-muted-fg uppercase tracking-widest block">Registro SPF Detectado</span>
                        <code className="block text-[10px] text-foreground/80 bg-muted/5 border border-border p-3 rounded-lg font-mono break-all leading-normal select-all">
                          {meta.spfParsed.record}
                        </code>
                      </div>
                      <div className="flex items-center justify-between text-[9px] text-muted-fg font-bold uppercase tracking-wider">
                        <span>Consultas DNS: <span className="text-foreground/80 font-mono">{meta.spfParsed.dnsLookups} / 10</span></span>
                        <span>Directiva: <span className={meta.spfParsed.isWeak ? 'text-[oklch(75% 0.13 80)]' : 'text-chartreuse'}>{meta.spfParsed.isWeak ? 'Débil (SoftFail/Neutral)' : 'Fuerte (HardFail)'}</span></span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                        <div className="bg-muted/5 border border-border/50 p-4 rounded-xl space-y-2">
                          <span className="text-[8px] font-bold text-muted-fg uppercase tracking-widest block">Diagnóstico de Seguridad</span>
                          <p className="text-foreground/80 leading-relaxed text-[11px]">
                            {meta.spfParsed.isWeak
                              ? 'El registro utiliza una directiva de atenuación blanda (como ~all o ?all) o supera el límite máximo de 10 consultas DNS autorizadas, lo que reduce la protección contra atacantes.'
                              : 'Filtro SPF robusto establecido. El dominio deniega de forma estricta (-all) todo correo enviado desde servidores SMTP no declarados en el registro.'}
                          </p>
                        </div>
                        <div className={`${meta.spfParsed.isWeak ? 'bg-destructive/[0.02] border-destructive/[0.08]' : 'bg-chartreuse/[0.02] border-chartreuse/[0.08]'} border p-4 rounded-xl space-y-2`}>
                          <span className={`text-[8px] font-bold ${meta.spfParsed.isWeak ? 'text-destructive' : 'text-chartreuse'} uppercase tracking-widest block`}>Impacto del Riesgo</span>
                          <p className="text-foreground/80 leading-relaxed text-[11px]">
                            {meta.spfParsed.isWeak
                              ? 'Un atacante puede enviar correos suplantando tu dominio institucional, burlando parcialmente la autenticación de servidores como Gmail o Microsoft 365.'
                              : 'Riesgo minimizado. Los proveedores de correo de destino rechazarán automáticamente los correos fraudulentos en tránsito que intenten suplantar tu identidad.'}
                          </p>
                        </div>
                      </div>

                      {meta.spfParsed.isWeak && meta.spfParsed.weakReason && (
                        <div className="text-[10px] text-[oklch(75% 0.13 80)] bg-[oklch(75% 0.13 80)]/[0.03] border border-[oklch(75% 0.13 80)]/10 p-3 rounded-xl leading-relaxed flex items-start gap-2.5">
                          <AlertTriangle className="w-4 h-4 shrink-0 text-[oklch(75% 0.13 80)] mt-0.5 animate-pulse" />
                          <span>{meta.spfParsed.weakReason}</span>
                        </div>
                      )}

                      <div className="space-y-2 pt-3.5 border-t border-border">
                        <div className="flex justify-between items-center">
                          <span className="text-[8px] font-bold text-primary uppercase tracking-widest flex items-center gap-1.5">
                            <Terminal className="w-3.5 h-3.5 text-primary" />
                            Código de Remediación DNS
                          </span>
                          <button
                            type="button"
                            onClick={() => onCopy("v=spf1 include:_spf.google.com -all", "spf_remediation")}
                            className="px-2.5 py-1 rounded-md text-[9px] font-bold text-muted-fg hover:text-foreground bg-muted/20 hover:bg-muted/40 border border-border transition-colors flex items-center gap-1.5 cursor-pointer"
                          >
                            {copiedId === 'spf_remediation' ? (
                              <>
                                <Check className="w-3 h-3 text-chartreuse animate-scale-up" />
                                <span>Copiado</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copiar</span>
                              </>
                            )}
                          </button>
                        </div>
                        <code className="block text-[10px] text-chartreuse bg-chartreuse/[0.15] border border-chartreuse/20 p-3.5 rounded-lg font-mono break-all leading-normal select-all">
                          v=spf1 include:_spf.google.com -all
                        </code>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-foreground/80 leading-relaxed text-[11px]">
                        El dominio no tiene un registro SPF configurado en su zona DNS. Esto permite que cualquier atacante falsifique la identidad del remitente de tus correos institucionales de manera directa.
                      </p>
                      <div className="space-y-2 pt-2 border-t border-border">
                        <div className="flex justify-between items-center">
                          <span className="text-[8px] font-bold text-primary uppercase tracking-widest flex items-center gap-1.5">
                            <Terminal className="w-3.5 h-3.5 text-primary" />
                            Crear Registro TXT Recomendado
                          </span>
                          <button
                            type="button"
                            onClick={() => onCopy("v=spf1 include:_spf.google.com -all", "spf_unconfigured_remediation")}
                            className="px-2.5 py-1 rounded-md text-[9px] font-bold text-muted-fg hover:text-foreground bg-muted/20 hover:bg-muted/40 border border-border transition-colors flex items-center gap-1.5 cursor-pointer"
                          >
                            {copiedId === 'spf_unconfigured_remediation' ? (
                              <>
                                <Check className="w-3 h-3 text-chartreuse animate-scale-up" />
                                <span>Copiado</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copiar</span>
                              </>
                            )}
                          </button>
                        </div>
                        <code className="block text-[10px] text-chartreuse bg-chartreuse/[0.15] border border-chartreuse/20 p-3.5 rounded-lg font-mono break-all leading-normal select-all">
                          v=spf1 include:_spf.google.com -all
                        </code>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* DMARC Accordion Card */}
            <div className="bg-muted/[0.4] border border-border backdrop-blur-xl hover:border-primary/20 rounded-xl overflow-hidden transition-colors duration-300">
              <button
                type="button"
                onClick={() => onToggleAccordion('dmarc')}
                className="w-full flex items-center justify-between p-4 cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/40 hover:bg-muted/10 transition-colors"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-extrabold text-foreground/80 uppercase tracking-widest">
                    DMARC Policy Enforcement
                  </span>
                  <span className="text-[9px] text-muted-fg font-medium">Instrucción de alineación SPF/DKIM</span>
                </div>
                <div className="flex items-center gap-3">
                  {meta?.dmarcParsed && meta.dmarcParsed.policy !== 'invalid' ? (
                    <span className={`text-[9px] font-bold px-2.5 py-0.5 rounded ${
                      meta.dmarcParsed.policy === 'reject'
                        ? 'bg-chartreuse/10 text-chartreuse border border-chartreuse/20'
                        : meta.dmarcParsed.policy === 'quarantine'
                        ? 'bg-primary/10 text-primary border border-primary/20'
                        : 'bg-[oklch(75% 0.13 80)]/10 text-[oklch(75% 0.13 80)] border border-[oklch(75% 0.13 80)]/20'
                    }`}>
                      Política: {meta.dmarcParsed.policy?.toUpperCase() || 'NINGUNA'}
                    </span>
                  ) : (
                    <span className="text-[9px] bg-destructive/10 text-destructive border border-destructive/20 px-2.5 py-0.5 rounded font-bold">
                      Inactivo / Inválido
                    </span>
                  )}
                  <ChevronDown className={`w-4 h-4 text-muted-fg transition-transform duration-300 ${expandedAccordions['dmarc'] ? 'rotate-180 text-primary' : ''}`} />
                </div>
              </button>

              {/* Smooth transition container */}
              <div className={`transition-[max-height,border-color] duration-300 ease-in-out overflow-hidden ${expandedAccordions['dmarc'] ? 'max-h-[600px] border-t border-border' : 'max-h-0'}`}>
                <div className="p-5 space-y-4 text-xs bg-muted/20">
                  {meta?.dmarcParsed && meta.dmarcParsed.policy !== 'invalid' ? (
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <span className="text-[8px] font-bold text-muted-fg uppercase tracking-widest block">Registro DMARC Detectado</span>
                        <code className="block text-[10px] text-foreground/80 bg-muted/5 border border-border p-3 rounded-lg font-mono break-all leading-normal select-all">
                          {meta.dmarcParsed.record}
                        </code>
                      </div>

                      {meta.dmarcParsed.rua && meta.dmarcParsed.rua.length > 0 && (
                        <div className="text-[9.5px] text-muted-fg flex flex-col gap-1.5 bg-muted/5 border border-border/70 p-3 rounded-xl">
                          <span className="font-bold uppercase tracking-wider text-muted-fg text-[8px]">Destino de Informes RUA (Agregados):</span>
                          <span className="text-foreground/80 font-mono text-[9.5px] break-all">{meta.dmarcParsed.rua.join(', ')}</span>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                        <div className="bg-muted/5 border border-border/50 p-4 rounded-xl space-y-2">
                          <span className="text-[8px] font-bold text-muted-fg uppercase tracking-widest block">Diagnóstico de la Política</span>
                          <p className="text-foreground/80 leading-relaxed text-[11px]">
                            {meta.dmarcParsed.policy === 'none'
                              ? 'La política "p=none" (Solo monitoreo) permite que los correos que fallen SPF/DKIM sigan entregándose en la bandeja de entrada del receptor. Es el nivel básico para auditar flujos.'
                              : meta.dmarcParsed.policy === 'quarantine'
                              ? 'La política "p=quarantine" solicita que los correos que fallen autenticación se envíen a la carpeta de correo no deseado (Spam).'
                              : 'Fidelidad extrema. La política "p=reject" rechaza completamente cualquier correo fraudulento, impidiendo su entrega por completo.'}
                          </p>
                        </div>
                        <div className={`${meta.dmarcParsed.policy === 'none' ? 'bg-destructive/[0.02] border-destructive/[0.08]' : 'bg-chartreuse/[0.02] border-chartreuse/[0.08]'} border p-4 rounded-xl space-y-2`}>
                          <span className={`text-[8px] font-bold ${meta.dmarcParsed.policy === 'none' ? 'text-destructive' : 'text-chartreuse'} uppercase tracking-widest block`}>Impacto de Riesgo de Seguridad</span>
                          <p className="text-foreground/80 leading-relaxed text-[11px]">
                            {meta.dmarcParsed.policy === 'none'
                              ? 'Ataque de suplantación viable. Un hacker puede seguir enviar phishing directo que aparente venir de tus directivos sin ser bloqueado.'
                              : 'Protección perimetral en curso. Los correos falsos se descartan o aíslan de las bandejas normales, limitando la tasa de éxito de campañas de phishing.'}
                          </p>
                        </div>
                      </div>

                      {meta.dmarcParsed.policy === 'none' && (
                        <div className="text-[10px] text-[oklch(75% 0.13 80)] bg-[oklch(75% 0.13 80)]/[0.03] border border-[oklch(75% 0.13 80)]/10 p-3 rounded-xl leading-relaxed flex items-start gap-2.5">
                          <AlertTriangle className="w-4 h-4 shrink-0 text-[oklch(75% 0.13 80)] mt-0.5 animate-pulse" />
                          <span>La política &apos;p=none&apos; solo monitorea pero no bloquea ni rechaza correos fraudulentos. Se recomienda migrar a &apos;quarantine&apos; o &apos;reject&apos; gradualmente.</span>
                        </div>
                      )}

                      <div className="space-y-2 pt-3.5 border-t border-border">
                        <div className="flex justify-between items-center">
                          <span className="text-[8px] font-bold text-primary uppercase tracking-widest flex items-center gap-1.5">
                            <Terminal className="w-3.5 h-3.5 text-primary" />
                            Código de Remediación DMARC (Políticas de Rechazo)
                          </span>
                          <button
                            type="button"
                            onClick={() => onCopy(`v=DMARC1; p=reject; pct=100; rua=mailto:dmarc-reports@${target}`, "dmarc_remediation")}
                            className="px-2.5 py-1 rounded-md text-[9px] font-bold text-muted-fg hover:text-foreground bg-muted/20 hover:bg-muted/40 border border-border transition-colors flex items-center gap-1.5 cursor-pointer"
                          >
                            {copiedId === 'dmarc_remediation' ? (
                              <>
                                <Check className="w-3 h-3 text-chartreuse animate-scale-up" />
                                <span>Copiado</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copiar</span>
                              </>
                            )}
                          </button>
                        </div>
                        <code className="block text-[10px] text-chartreuse bg-chartreuse/[0.15] border border-chartreuse/20 p-3.5 rounded-lg font-mono break-all leading-normal select-all">
                          v=DMARC1; p=reject; pct=100; rua=mailto:dmarc-reports@{target}
                        </code>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-foreground/80 leading-relaxed text-[11px]">
                        No se detectó una política DMARC válida en el host. DMARC es el escudo definitivo que ordena a los servidores del mundo cómo manejar correos fraudulentos que pretendan ser tuyos.
                      </p>
                      <div className="space-y-2 pt-2 border-t border-border">
                        <div className="flex justify-between items-center">
                          <span className="text-[8px] font-bold text-primary uppercase tracking-widest flex items-center gap-1.5">
                            <Terminal className="w-3.5 h-3.5 text-primary" />
                            Crear Registro TXT Recomendado
                          </span>
                          <button
                            type="button"
                            onClick={() => onCopy(`v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc-reports@${target}`, "dmarc_unconfigured_remediation")}
                            className="px-2.5 py-1 rounded-md text-[9px] font-bold text-muted-fg hover:text-foreground bg-muted/20 hover:bg-muted/40 border border-border transition-colors flex items-center gap-1.5 cursor-pointer"
                          >
                            {copiedId === 'dmarc_unconfigured_remediation' ? (
                              <>
                                <Check className="w-3 h-3 text-chartreuse animate-scale-up" />
                                <span>Copiado</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copiar</span>
                              </>
                            )}
                          </button>
                        </div>
                        <code className="block text-[10px] text-chartreuse bg-chartreuse/[0.15] border border-chartreuse/20 p-3.5 rounded-lg font-mono break-all leading-normal select-all">
                          v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc-reports@{target}
                        </code>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* DKIM & BIMI Mini-grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-muted/40 border border-border/50 rounded-xl p-3.5 flex flex-col gap-1 justify-between">
                <span className="text-[9px] font-bold text-muted-fg uppercase tracking-wider">
                  Selectores DKIM
                </span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-xl font-extrabold text-foreground">
                    {meta?.dkimCount ?? 0}
                  </span>
                  <span className="text-[9px] font-bold text-muted-fg">Encontrados</span>
                </div>
                <span className="text-[8px] text-muted-fg leading-normal mt-1">
                  {meta?.dkimCount && meta.dkimCount > 0 ? '✓ Firmas criptográficas activas.' : '⚠ No se detectaron firmas estándar.'}
                </span>
              </div>

              <div className="bg-muted/40 border border-border/50 rounded-xl p-3.5 flex flex-col gap-1 justify-between">
                <span className="text-[9px] font-bold text-muted-fg uppercase tracking-wider">
                  Protocolo BIMI
                </span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className={`text-xs font-extrabold ${meta?.bimiSuccess ? 'text-chartreuse' : 'text-muted-fg'}`}>
                    {meta?.bimiSuccess ? 'Certificado' : 'No detectado'}
                  </span>
                </div>
                <span className="text-[8px] text-muted-fg leading-normal mt-1">
                  {meta?.bimiSuccess ? '✓ Logo corporativo validado.' : 'Logo en bandeja de entrada inactivo.'}
                </span>
              </div>
            </div>

          </div>
        </div>

        {/* Right Column: Web Infrastructure & Security Headers */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-extrabold text-foreground/80 uppercase tracking-wider flex items-center gap-2">
              <Server className="w-4 h-4 text-primary" />
              Seguridad Web e Infraestructura
            </h4>
            {infraScore !== null && (
              <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                infraScore >= 80 ? 'text-chartreuse border-chartreuse/20 bg-chartreuse/5' : 'text-destructive border-destructive/20 bg-destructive/5'
              }`}>
                Score: {infraScore}/100
              </span>
            )}
          </div>

          <div className="space-y-4">
            {/* HTTPS & Protocol Enforcement */}
            <div className="bg-muted/40 border border-border/50 rounded-xl p-4 space-y-3.5">
              <span className="text-[10px] font-extrabold text-muted-fg uppercase tracking-widest block">
                Seguridad de Conexión y Transporte (TLS)
              </span>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-chartreuse/10 border border-chartreuse/20 flex items-center justify-center shrink-0">
                    <Lock className="w-4 h-4 text-chartreuse" />
                  </div>
                  <div>
                    <div className="text-[9px] font-extrabold text-muted-fg uppercase tracking-wider">Redirección HTTPS</div>
                    <div className="text-xs font-bold text-foreground mt-0.5">
                      {meta?.redirectsToHttps ? 'Establecida' : 'Faltante / Débil'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                    <Cpu className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <div className="text-[9px] font-extrabold text-muted-fg uppercase tracking-wider">Cifrado de Capa</div>
                    <div className="text-xs font-bold text-foreground mt-0.5">
                      TLS v1.3 / v1.2
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Web Security Headers Compliance Checklist */}
            <div className="bg-muted/[0.4] border border-border backdrop-blur-xl rounded-xl p-4 space-y-4">
              <span className="text-[10px] font-extrabold text-muted-fg uppercase tracking-widest block">
                Cumplimiento de Cabeceras de Seguridad
              </span>

              <div className="space-y-2">
                {[
                  {
                    id: 'csp',
                    name: 'Content-Security-Policy (CSP)',
                    status: findings.every(f => !f.title.includes('Content-Security-Policy')),
                    description: 'Mitiga inyecciones XSS y secuestro de datos definiendo orígenes autorizados.',
                    diagnostic: 'CSP restringe los recursos (scripts, estilos, fuentes) que el navegador tiene permitido cargar. Si un atacante inyecta un script malicioso (XSS), CSP impide su ejecución si no está explícitamente autorizado en la directiva.',
                    risk: 'Crítico. Sin CSP, tu sitio es totalmente vulnerable al secuestro de tokens de sesión, lectura de cookies desprotegidas y alteración visual mediante ataques Cross-Site Scripting.',
                    code: `# Directiva Nginx sugerida para bloques de servidor (CSP estricto, sin terceros):\nadd_header Content-Security-Policy "default-src 'self'; script-src 'self' 'nonce-<RANDOM>' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; base-uri 'self'; frame-ancestors 'self';" always;`
                  },
                  {
                    id: 'hsts',
                    name: 'Strict-Transport-Security (HSTS)',
                    status: findings.every(f => !f.title.includes('Strict-Transport-Security') && !f.description.includes('HSTS')),
                    description: 'Fuerza conexiones cifradas HTTPS de forma estricta en el navegador.',
                    diagnostic: 'HSTS le ordena al navegador web comunicarse únicamente mediante HTTPS seguro durante la vigencia máxima declarada, previniendo degradaciones de seguridad accidentales.',
                    risk: 'Alto (SSL Stripping). Previene interceptaciones Man-in-the-Middle donde un atacante degrada la conexión de un cliente a HTTP para robar su sesión en tránsito.',
                    code: `# En Nginx (asegúrate de que solo esté en el servidor HTTPS):\nadd_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;`
                  },
                  {
                    id: 'xframe',
                    name: 'X-Frame-Options (Clickjacking Protection)',
                    status: findings.every(f => !f.title.includes('X-Frame-Options') && !f.title.includes('Clickjacking')),
                    description: 'Evita que tu sitio web sea embebido de forma fraudulenta en iframes externos.',
                    diagnostic: 'X-Frame-Options o las directivas CSP prohíben que otros sitios embeban tus páginas en iframes, previniendo que realicen trucos visuales interactivos.',
                    risk: 'Medio (Clickjacking). Un atacante puede superponer tus botones importantes (como "Pagar" o "Autorizar") dentro de un iframe invisible para hacer que tus usuarios los pulsen sin saberlo.',
                    code: `# En Nginx para evitar incrustaciones de forma global:\nadd_header X-Frame-Options "DENY" always;`
                  },
                  {
                    id: 'cookie_flags',
                    name: 'Cookie Security Flags (HttpOnly & Secure)',
                    status: findings.every(f => !f.title.includes('HttpOnly') && !f.title.includes('Secure') && !f.title.includes('Cookie')),
                    description: 'Protege las cookies de sesión contra el robo mediante scripts maliciosos.',
                    diagnostic: 'Fuerza a las cookies a operar de forma aislada. HttpOnly impide el acceso mediante document.cookie en JavaScript, Secure prohíbe el envío sobre conexiones HTTP no cifradas y SameSite mitiga ataques CSRF.',
                    risk: 'Crítico. Sin HttpOnly, cualquier script malicioso inyectado localmente puede leer la cookie de autenticación del usuario final y secuestrar su sesión al instante.',
                    code: `// En Next.js (Server Actions / Route Handlers):\ncookies().set('session', token, {\n  httpOnly: true,\n  secure: true,\n  sameSite: 'lax',\n  path: '/'\n});`
                  }
                ].map((header, idx) => {
                  const isOpen = !!expandedAccordions[header.id];
                  const copyId = `${header.id}_remediation`;
                  return (
                    <div key={idx} className="flex flex-col">
                      <button
                        type="button"
                        onClick={() => onToggleAccordion(header.id)}
                        className="w-full flex items-start justify-between gap-4 cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/40 bg-muted/[0.2] border border-border/50 hover:border-border rounded-xl px-4 py-3 transition-colors duration-200"
                      >
                        <div className="space-y-0.5 flex-1 min-w-0">
                          <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                            {header.name}
                          </span>
                          <p className="text-[10px] text-muted-fg leading-normal truncate">
                            {header.description}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className={`px-2 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-wider ${
                            header.status
                              ? 'bg-chartreuse/10 text-chartreuse border border-chartreuse/20'
                              : 'bg-destructive/10 text-destructive border border-destructive/20'
                          }`}>
                            {header.status ? 'Cumple' : 'Incompleto'}
                          </span>
                          <ChevronDown className={`w-3.5 h-3.5 text-muted-fg transition-transform duration-300 ${isOpen ? 'rotate-180 text-primary' : ''}`} />
                        </div>
                      </button>

                      {/* Collapsable Content */}
                      <div className={`transition-[max-height,margin] duration-300 ease-in-out overflow-hidden ${isOpen ? 'max-h-[450px] mt-2 mb-3' : 'max-h-0'}`}>
                        <div className="bg-muted/[0.5] border border-border p-4 rounded-xl space-y-3.5 text-[11px] leading-relaxed">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <span className="text-[8px] font-bold text-muted-fg uppercase tracking-widest block">Diagnóstico Detallado</span>
                              <p className="text-muted-fg">{header.diagnostic}</p>
                            </div>
                            <div className="space-y-1">
                              <span className="text-[8px] font-bold text-destructive uppercase tracking-widest block">Impacto y Explotabilidad</span>
                              <p className="text-muted-fg">{header.risk}</p>
                            </div>
                          </div>

                          <div className="space-y-2 pt-2 border-t border-border/50">
                            <div className="flex justify-between items-center">
                              <span className="text-[8px] font-bold text-primary uppercase tracking-widest">Código de Remediación / Configuración</span>
                              <button
                                type="button"
                                onClick={() => onCopy(header.code, copyId)}
                                className="text-[9px] font-bold text-muted-fg hover:text-foreground uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors duration-200"
                              >
                                {copiedId === copyId ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-chartreuse" />
                                    <span className="text-chartreuse font-bold">¡Copiado!</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    <span>Copiar</span>
                                  </>
                                )}
                              </button>
                            </div>
                            <pre className="p-3.5 overflow-x-auto text-[10px] font-mono text-chartreuse bg-chartreuse/[0.15] border border-chartreuse/20 rounded-lg max-h-[120px] leading-relaxed select-all">
                              {header.code}
                            </pre>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
