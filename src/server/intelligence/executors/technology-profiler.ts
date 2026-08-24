import { z } from "zod";
import dns from "node:dns/promises";
import { assertPublicHostname, safeFetch } from "../security/egress-guard";
import { ToolExecutor, ExecutionContext, ExecutionResult, Finding, TechnologyProfileOutput, DetectedTechnology } from "../types/executor.types";

const urlSchema = z.object({ url: z.string().url() });

type SigH = { header: string; pattern: RegExp; tech: Omit<DetectedTechnology, "evidence">; };
type SigM = { name: string; pattern?: RegExp; tech: Omit<DetectedTechnology, "evidence">; };
type SigS = { pattern: RegExp; tech: Omit<DetectedTechnology, "evidence">; };
type SigC = { name: string; tech: Omit<DetectedTechnology, "evidence">; };

const HEADER_SIG: SigH[] = [
  { header: "server", pattern: /nginx/i, tech: { name: "Nginx", category: "web-server", confidence: 0.95 } },
  { header: "server", pattern: /apache/i, tech: { name: "Apache", category: "web-server", confidence: 0.95 } },
  { header: "server", pattern: /cloudflare/i, tech: { name: "Cloudflare", category: "cdn", confidence: 0.95 } },
  { header: "server", pattern: /caddy/i, tech: { name: "Caddy", category: "web-server", confidence: 0.9 } },
  { header: "server", pattern: /microsoft-iis/i, tech: { name: "IIS", category: "web-server", confidence: 0.95 } },
  { header: "server", pattern: /LiteSpeed/i, tech: { name: "LiteSpeed", category: "web-server", confidence: 0.9 } },
  { header: "x-powered-by", pattern: /express/i, tech: { name: "Express.js", category: "framework", confidence: 0.85 } },
  { header: "x-powered-by", pattern: /next/i, tech: { name: "Next.js", category: "framework", confidence: 0.9 } },
  { header: "x-powered-by", pattern: /ASP/i, tech: { name: "ASP.NET", category: "runtime", confidence: 0.9 } },
  { header: "x-powered-by", pattern: /PHP/i, tech: { name: "PHP", category: "runtime", confidence: 0.95 } },
  { header: "x-generator", pattern: /WordPress/i, tech: { name: "WordPress", category: "cms", confidence: 0.95 } },
  { header: "x-generator", pattern: /Drupal/i, tech: { name: "Drupal", category: "cms", confidence: 0.95 } },
  { header: "via", pattern: /cloudflare/i, tech: { name: "Cloudflare", category: "cdn", confidence: 0.9 } },
  { header: "via", pattern: /cloudfront/i, tech: { name: "AWS CloudFront", category: "cdn", confidence: 0.8 } },
  { header: "via", pattern: /fastly/i, tech: { name: "Fastly", category: "cdn", confidence: 0.85 } },
  { header: "via", pattern: /akamai/i, tech: { name: "Akamai", category: "cdn", confidence: 0.85 } },
  { header: "cf-ray", pattern: /./, tech: { name: "Cloudflare", category: "cdn", confidence: 0.98 } },
  { header: "x-vercel-id", pattern: /./, tech: { name: "Vercel", category: "hosting", confidence: 0.95 } },
  { header: "x-amz-cf-id", pattern: /./, tech: { name: "AWS CloudFront", category: "cdn", confidence: 0.9 } },
  { header: "x-azure-ref", pattern: /./, tech: { name: "Azure CDN", category: "cdn", confidence: 0.85 } },
  { header: "x-akamai-transformed", pattern: /./, tech: { name: "Akamai", category: "cdn", confidence: 0.9 } },
  { header: "x-sucuri-id", pattern: /./, tech: { name: "Sucuri", category: "cdn", confidence: 0.95 } },
];

const META_SIG: SigM[] = [
  { name: "generator", pattern: /WordPress/i, tech: { name: "WordPress", category: "cms", confidence: 0.95 } },
  { name: "generator", pattern: /Drupal/i, tech: { name: "Drupal", category: "cms", confidence: 0.95 } },
  { name: "generator", pattern: /Joomla/i, tech: { name: "Joomla", category: "cms", confidence: 0.9 } },
  { name: "generator", pattern: /Shopify/i, tech: { name: "Shopify", category: "cms", confidence: 0.9 } },
  { name: "generator", pattern: /Ghost/i, tech: { name: "Ghost", category: "cms", confidence: 0.9 } },
  { name: "generator", pattern: /Astro/i, tech: { name: "Astro", category: "framework", confidence: 0.85 } },
  { name: "generator", pattern: /Hugo/i, tech: { name: "Hugo", category: "cms", confidence: 0.85 } },
  { name: "generator", pattern: /Webflow/i, tech: { name: "Webflow", category: "cms", confidence: 0.85 } },
  { name: "generator", pattern: /Squarespace/i, tech: { name: "Squarespace", category: "cms", confidence: 0.85 } },
  { name: "generator", pattern: /Wix/i, tech: { name: "Wix", category: "cms", confidence: 0.8 } },
];

const SCRIPT_SIG: SigS[] = [
  // Frameworks
  { pattern: /_next\/static\/chunks/i, tech: { name: "Next.js", category: "framework", confidence: 0.95 } },
  { pattern: /_nuxt/i, tech: { name: "Nuxt.js", category: "framework", confidence: 0.9 } },
  { pattern: /\/react\.[^/]+\.js/i, tech: { name: "React", category: "framework", confidence: 0.9 } },
  { pattern: /vue.*\.(min\.)?js/i, tech: { name: "Vue.js", category: "framework", confidence: 0.9 } },
  { pattern: /angular.*\.js/i, tech: { name: "Angular", category: "framework", confidence: 0.85 } },
  { pattern: /svelte/i, tech: { name: "Svelte", category: "framework", confidence: 0.8 } },
  { pattern: /gatsby/i, tech: { name: "Gatsby", category: "framework", confidence: 0.85 } },
  { pattern: /remix/i, tech: { name: "Remix", category: "framework", confidence: 0.85 } },
  // JS Libraries
  { pattern: /jquery/i, tech: { name: "jQuery", category: "js-library", confidence: 0.95 } },
  { pattern: /three\.(min\.)?js/i, tech: { name: "Three.js", category: "js-library", confidence: 0.85 } },
  { pattern: /d3\.(min\.)?js/i, tech: { name: "D3.js", category: "js-library", confidence: 0.85 } },
  { pattern: /chart\.(min\.)?js/i, tech: { name: "Chart.js", category: "js-library", confidence: 0.8 } },
  { pattern: /moment.*\.(min\.)?js/i, tech: { name: "Moment.js", category: "js-library", confidence: 0.9 } },
  { pattern: /lodash/i, tech: { name: "Lodash", category: "js-library", confidence: 0.85 } },
  { pattern: /gsap/i, tech: { name: "GSAP", category: "js-library", confidence: 0.85 } },
  { pattern: /swiper/i, tech: { name: "Swiper", category: "js-library", confidence: 0.8 } },
  // Analytics
  { pattern: /gtag\/js|\/gtm\.js/i, tech: { name: "Google Analytics", category: "analytics", confidence: 0.85 } },
  { pattern: /hotjar/i, tech: { name: "Hotjar", category: "analytics", confidence: 0.85 } },
  { pattern: /clarity\.ms/i, tech: { name: "Microsoft Clarity", category: "analytics", confidence: 0.85 } },
  { pattern: /mixpanel/i, tech: { name: "Mixpanel", category: "analytics", confidence: 0.85 } },
  { pattern: /amplitude/i, tech: { name: "Amplitude", category: "analytics", confidence: 0.85 } },
  { pattern: /fullstory/i, tech: { name: "FullStory", category: "analytics", confidence: 0.85 } },
  { pattern: /hs-scripts|js\.hs-scripts/i, tech: { name: "HubSpot", category: "analytics", confidence: 0.9 } },
  { pattern: /\/fbevents|connect\.facebook/i, tech: { name: "Meta Pixel", category: "analytics", confidence: 0.9 } },
  { pattern: /linkedin\/insight/i, tech: { name: "LinkedIn Insight Tag", category: "analytics", confidence: 0.85 } },
  // CSS & CMS
  { pattern: /bootstrap.*\.css/i, tech: { name: "Bootstrap", category: "css-library", confidence: 0.95 } },
  { pattern: /font-awesome|fa\.css/i, tech: { name: "Font Awesome", category: "css-library", confidence: 0.9 } },
  { pattern: /tailwindcss/i, tech: { name: "Tailwind CSS", category: "css-library", confidence: 0.9 } },
  { pattern: /wp-content/i, tech: { name: "WordPress", category: "cms", confidence: 0.9 } },
  { pattern: /myshopify/i, tech: { name: "Shopify", category: "cms", confidence: 0.9 } },
  // Headless CMS + CDNs
  { pattern: /cdn\.contentful\.com/i, tech: { name: "Contentful", category: "cms", confidence: 0.9 } },
  { pattern: /cdn\.sanity\.io/i, tech: { name: "Sanity", category: "cms", confidence: 0.85 } },
  { pattern: /strapi/i, tech: { name: "Strapi", category: "cms", confidence: 0.8 } },
  { pattern: /prismic\.io/i, tech: { name: "Prismic", category: "cms", confidence: 0.85 } },
  { pattern: /magento/i, tech: { name: "Magento", category: "cms", confidence: 0.85 } },
];

const COOKIE_SIG: SigC[] = [
  { name: "__cfduid", tech: { name: "Cloudflare", category: "cdn", confidence: 0.95 } },
  { name: "PHPSESSID", tech: { name: "PHP", category: "runtime", confidence: 0.8 } },
  { name: "ASP.NET_SessionId", tech: { name: "ASP.NET", category: "runtime", confidence: 0.9 } },
  { name: "laravel_session", tech: { name: "Laravel", category: "framework", confidence: 0.85 } },
  { name: "_ga", tech: { name: "Google Analytics", category: "analytics", confidence: 0.8 } },
  { name: "_fbp", tech: { name: "Meta Pixel", category: "analytics", confidence: 0.85 } },
];

const GA_RE = /(?:ga\(|gtag\(|dataLayer\s*=|GoogleAnalyticsObject|gaGlobal)/i;
const GTM_RE = /googletagmanager/i;
const FBQ_RE = /fbq\s*\(/i;

export const technologyProfilerExecutor: ToolExecutor<{ url: string }, TechnologyProfileOutput> = {
  id: "website.tech_stack",
  timeoutMs: 20000,
  category: "website",
  validate(input: unknown) { return urlSchema.parse(input); },
  async execute(ctx: ExecutionContext, { url }): Promise<ExecutionResult<TechnologyProfileOutput>> {
    ctx.log("Analyzing tech stack: " + url);
    const host = new URL(url).hostname;
    await assertPublicHostname(host);
    const detected: DetectedTechnology[] = [];
    let html = "";
    const headers: Record<string, string> = {};

    try {
      const res = await safeFetch(url, { headers: { "User-Agent": "SCAUDIT-TechProfiler/1.0" } });
      res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
      html = await res.text();
    } catch { /* headers + DNS only */ }

    for (const s of HEADER_SIG) {
      const v = headers[s.header];
      if (!v || !s.pattern.test(v)) continue;
      const vers = v.match(/([\d.]+)/);
      detected.push({ ...s.tech, version: vers?.[1], evidence: "HTTP " + s.header + ": " + v.substring(0, 60) });
    }

    try {
      const cn = await dns.resolve(host, "CNAME");
      if (cn?.length) {
        const c = cn[0]!.toLowerCase();
        const cdn: Array<[RegExp, string]> = [
          [/cloudflare/i, "Cloudflare"], [/cloudfront/i, "AWS CloudFront"],
          [/fastly/i, "Fastly"], [/akamai|edgekey/i, "Akamai"],
          [/azureedge/i, "Azure CDN"],
        ];
        for (const [re, name] of cdn) {
          if (re.test(c)) { detected.push({ name, category: "cdn", confidence: 0.9, evidence: "CNAME: " + c }); break; }
        }
      }
    } catch { /* no CNAME */ }

    const ck = headers["set-cookie"] || "";
    for (const s of COOKIE_SIG) {
      if (ck.includes(s.name)) detected.push({ ...s.tech, evidence: "Cookie: " + s.name });
    }

    if (html) {
      for (const s of META_SIG) {
        const re = new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]+name=["\']' + s.name + '["\']', "i");
        const m = re.exec(html);
        if (m && s.pattern?.test(m[1]!)) {
          const vers = m[1]!.match(/([\d.]+)/);
          detected.push({ ...s.tech, version: vers?.[1], evidence: "Meta " + s.name + ": " + m[1]!.substring(0, 60) });
        }
      }

      const srcs: string[] = [];
      const srcRe = /<script[^>]*src=["\']([^"\']*)["\'][^>]*>/gi;
      let sm: RegExpExecArray | null;
      while ((sm = srcRe.exec(html)) !== null) srcs.push(sm[1]!);

      for (const s of SCRIPT_SIG) {
        for (const src of srcs) {
          if (s.pattern.test(src)) {
            const vers = src.match(/([\d.]+)/);
            detected.push({ ...s.tech, version: vers?.[1], evidence: "Script: " + src.substring(0, 80) });
            break;
          }
        }
      }

      const h = html.substring(0, 30000);
      if (GA_RE.test(h)) detected.push({ name: "Google Analytics", category: "analytics", confidence: 0.85, evidence: "Inline GA detected" });
      if (FBQ_RE.test(h)) detected.push({ name: "Meta Pixel", category: "analytics", confidence: 0.9, evidence: "Inline fbq() detected" });
      if (GTM_RE.test(html)) detected.push({ name: "Google Tag Manager", category: "analytics", confidence: 0.9, evidence: "GTM detected" });
    }

    // Dedup
    const map = new Map<string, DetectedTechnology>();
    for (const t of detected) {
      const e = map.get(t.name);
      if (!e || t.confidence > e.confidence) map.set(t.name, t);
    }
    const techs = Array.from(map.values());
    const cats = [...new Set(techs.map(t => t.category))];

    const findings: Finding[] = [];
    if (techs.length === 0) {
      findings.push({ severity: "info", confidence: 0.9, title: "No se detectaron tecnologias",
        description: "No se encontraron tecnologias conocidas en " + host,
        recommendation: "Intente escaneo manual adicional.", affectedAsset: url, evidence: { totalDetected: 0 } });
    } else {
      findings.push({ severity: "info", confidence: 0.95,
        title: "Stack tecnologico: " + techs.length + " tecnologias",
        description: "Detectadas: " + techs.map(t => t.name).join(", "),
        recommendation: "Revise que esten actualizadas.", affectedAsset: url,
        evidence: { totalDetected: techs.length, technologies: techs.map(t => ({ name: t.name, category: t.category })) } });
      for (const t of techs) {
        if (["jQuery", "Moment.js", "PHP"].includes(t.name)) {
          findings.push({ severity: "medium", confidence: t.confidence,
            title: t.name + " potencialmente obsoleto",
            description: t.name + " puede tener vulnerabilidades conocidas.",
            recommendation: "Actualice a la version mas reciente.",
            affectedAsset: url, evidence: { technology: t.name, version: t.version } });
        }
      }
    }

    ctx.log("Found " + techs.length + " technologies.");
    return { success: true, output: { url, host, technologies: techs, categoriesFound: cats, totalDetected: techs.length }, findings };
  },
};
