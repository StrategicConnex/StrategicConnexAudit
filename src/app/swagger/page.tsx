import { Suspense } from 'react';
import { ArrowLeft, BookOpen } from 'lucide-react';
import SwaggerLazyLoader from './SwaggerLazyLoader';

/**
 * Swagger UI page — Server Component that renders the SCAUDIT OpenAPI spec
 * interactively.
 *
 * The heavy swagger-ui-react bundle (~3MB) lives behind SwaggerLazyLoader,
 * a client component using next/dynamic with ssr:false. That keeps the chunk
 * OUT of this route's initial HTML/JS (verified: not in the initial script
 * tags) — it downloads only after hydration, with a skeleton meanwhile.
 * The Suspense boundary is a belt-and-suspenders fallback for the loader.
 *
 * Dark theme CSS overrides are inlined here (not in SwaggerClient) so the
 * page gets styled immediately without waiting for the chunk.
 */
export default function SwaggerPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <style>{`
        /* ════════════════════════════════════════════════════════════════
           SCAUDIT Swagger UI — Dark Theme Overrides
           ════════════════════════════════════════════════════════════════ */

        .swagger-ui { color: #F1F5F9; font-family: 'Inter', 'Helvetica Neue', sans-serif; }
        .swagger-ui .wrapper { max-width: 1200px; margin: 0 auto; padding: 20px 24px; }
        .swagger-ui .topbar { display: none; }

        .swagger-ui .info { margin: 24px 0; }
        .swagger-ui .info .title { color: #F1F5F9; font-weight: 800; font-size: 28px; font-family: 'DM Sans','Inter',sans-serif; letter-spacing: -0.02em; }
        .swagger-ui .info .title small { background: #6366F1; color: #FFF; font-size: 11px; padding: 4px 10px; border-radius: 20px; vertical-align: middle; }
        .swagger-ui .info .description p { color: #94A3B8; font-size: 14px; line-height: 1.6; }
        .swagger-ui .info .base-url { color: #A3E635; font-family: 'JetBrains Mono',monospace; font-size: 12px; font-weight: 600; }
        .swagger-ui .info li a { color: #818CF8; }

        .swagger-ui .servers { background: #131722; border: 1px solid #1E293B; border-radius: 12px; padding: 16px 20px; margin-bottom: 24px; }
        .swagger-ui .servers label { color: #94A3B8; }
        .swagger-ui .servers select { background: #0A0E17; color: #F1F5F9; border: 1px solid #1E293B; border-radius: 8px; padding: 8px 12px; font-family: 'JetBrains Mono',monospace; font-size: 12px; }
        .swagger-ui .scheme-container { background: transparent; box-shadow: none; padding: 0; margin: 0 0 16px 0; }
        .swagger-ui .opblock-tag { color: #F1F5F9; font-weight: 700; font-size: 18px; font-family: 'DM Sans','Inter',sans-serif; border-bottom: 1px solid #1E293B; padding: 16px 0; margin: 24px 0 12px 0; }
        .swagger-ui .opblock-tag:hover { background: rgba(99,102,241,0.03); }
        .swagger-ui .opblock-tag small { color: #64748B; font-size: 13px; font-weight: 400; }
        .swagger-ui .opblock-tag .info-btn { display: none; }

        .swagger-ui .opblock { border-radius: 12px; border: 1px solid #1E293B; margin: 0 0 12px 0; background: #131722; box-shadow: none; }
        .swagger-ui .opblock .opblock-summary { padding: 14px 20px; border-bottom: none; }
        .swagger-ui .opblock .opblock-summary-method { border-radius: 6px; font-size: 11px; font-weight: 800; padding: 4px 12px; min-width: 60px; text-align: center; text-shadow: none; letter-spacing: 0.05em; }
        .swagger-ui .opblock.opblock-get .opblock-summary-method { background: #A3E635; color: #000; }
        .swagger-ui .opblock.opblock-post .opblock-summary-method { background: #6366F1; color: #FFF; }
        .swagger-ui .opblock.opblock-delete .opblock-summary-method { background: #EF4444; color: #FFF; }
        .swagger-ui .opblock .opblock-summary-path { font-family: 'JetBrains Mono',monospace; font-size: 13px; color: #F1F5F9; font-weight: 600; }
        .swagger-ui .opblock .opblock-summary-description { color: #94A3B8; font-size: 12px; }
        .swagger-ui .opblock .opblock-section-header { background: #0A0E17; border: 1px solid #1E293B; border-radius: 8px; padding: 12px 16px; margin: 12px 16px; }
        .swagger-ui .opblock .opblock-section-header h4 { color: #F1F5F9; font-weight: 700; font-size: 13px; }
        .swagger-ui .opblock .opblock-section-header .btn { background: #6366F1; color: #FFF; border: none; border-radius: 8px; font-weight: 700; font-size: 11px; padding: 6px 16px; }
        .swagger-ui .opblock .tab li { color: #94A3B8; font-size: 12px; font-weight: 600; }
        .swagger-ui .opblock .tab li.active { color: #6366F1; }
        .swagger-ui .opblock .opblock-description-wrapper p, .swagger-ui .opblock .opblock-description-wrapper .renderedMarkdown p { color: #94A3B8; font-size: 13px; line-height: 1.6; }
        .swagger-ui table thead tr td, .swagger-ui table thead tr th { color: #64748B; font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #1E293B; padding: 10px 12px; }
        .swagger-ui table tbody tr td { color: #CBD5E1; border-bottom: 1px solid rgba(30,41,59,0.5); padding: 10px 12px; font-size: 12px; }
        .swagger-ui .parameters-col_name { color: #A5B4FC; font-weight: 600; font-family: 'JetBrains Mono',monospace; font-size: 12px; }
        .swagger-ui .parameters-col_description input, .swagger-ui .parameters-col_description textarea, .swagger-ui .parameters-col_description select { background: #0A0E17; color: #F1F5F9; border: 1px solid #1E293B; border-radius: 8px; padding: 8px 12px; font-family: 'JetBrains Mono',monospace; font-size: 12px; }
        .swagger-ui .parameters-col_description .markdown p { color: #94A3B8; font-size: 11px; }
        .swagger-ui .responses-inner h4, .swagger-ui .responses-inner .response-col_status { color: #F1F5F9; font-weight: 700; }
        .swagger-ui .responses-inner .response-col_description { color: #94A3B8; }
        .swagger-ui .responses-inner .response-col_links { color: #64748B; }
        .swagger-ui .model-box { background: #0A0E17; border: 1px solid #1E293B; border-radius: 8px; padding: 12px; }
        .swagger-ui .model, .swagger-ui .model-title { color: #F1F5F9; font-family: 'JetBrains Mono',monospace; font-size: 12px; }
        .swagger-ui .model .property.primitive { color: #A3E635; }
        .swagger-ui .model .property { color: #94A3B8; }
        .swagger-ui .btn { border-radius: 8px; font-weight: 700; font-size: 12px; padding: 8px 18px; border: 1px solid #1E293B; background: #0A0E17; color: #F1F5F9; transition: all 0.2s; }
        .swagger-ui .btn:hover { border-color: #6366F1; background: rgba(99,102,241,0.1); }
        .swagger-ui .btn.execute { background: #6366F1; color: #FFF; border: none; }
        .swagger-ui .btn.execute:hover { background: #5558E6; }
        .swagger-ui .btn.cancel { background: transparent; color: #EF4444; border: 1px solid #EF4444; }
        .swagger-ui .highlight-code { background: #0A0E17; border: 1px solid #1E293B; border-radius: 10px; overflow: hidden; }
        .swagger-ui .highlight-code .lang-json { color: #CBD5E1; font-family: 'JetBrains Mono',monospace; font-size: 12px; }
        .swagger-ui .highlight-code .copy-to-clipboard { background: #131722; border: 1px solid #1E293B; border-radius: 6px; color: #64748B; }
        .swagger-ui .dialog-ux .modal-ux { background: #131722; border: 1px solid #1E293B; border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,0.5); }
        .swagger-ui .dialog-ux .modal-ux-header { border-bottom: 1px solid #1E293B; }
        .swagger-ui .dialog-ux .modal-ux-header h3 { color: #F1F5F9; font-weight: 700; }
        .swagger-ui .dialog-ux .modal-ux-content { color: #94A3B8; }
        .swagger-ui .dialog-ux .modal-ux-content input { background: #0A0E17; color: #F1F5F9; border: 1px solid #1E293B; border-radius: 8px; padding: 8px 12px; font-family: 'JetBrains Mono',monospace; }
        .swagger-ui .auth-btn-wrapper .btn-done { background: #6366F1; color: #FFF; border: none; border-radius: 8px; font-weight: 700; }
        .swagger-ui .loading-container { padding: 40px 0; }
        .swagger-ui .loading-container .loading { color: #94A3B8; }
        .swagger-ui ::-webkit-scrollbar { width: 6px; height: 6px; }
        .swagger-ui ::-webkit-scrollbar-track { background: #0A0E17; }
        .swagger-ui ::-webkit-scrollbar-thumb { background: #1E293B; border-radius: 3px; }
        .swagger-ui ::-webkit-scrollbar-thumb:hover { background: #334155; }
        .swagger-ui .responses-wrapper .responses-header td { color: #64748B; }
        .swagger-ui .responses-wrapper .response .response-col_status { font-weight: 700; }
        .swagger-ui .responses-wrapper .response .response-col_description__inner div.markdown { background: #0A0E17; border: 1px solid #1E293B; border-radius: 8px; padding: 12px; }
        .swagger-ui .responses-wrapper .response .response-col_description__inner div.markdown p { color: #94A3B8; }
        .swagger-ui section.models { border: 1px solid #1E293B; border-radius: 12px; margin-top: 32px; }
        .swagger-ui section.models .model-container { background: #131722; border-radius: 8px; margin: 8px 0; }
        .swagger-ui section.models .model-container:hover { background: rgba(99,102,241,0.03); }
        .swagger-ui section.models .model-box { background: transparent; border: none; }
        .swagger-ui section.models h4 { color: #F1F5F9; font-family: 'DM Sans','Inter',sans-serif; font-weight: 700; font-size: 16px; }
        .swagger-ui section.models h4 span { color: #94A3B8; font-size: 12px; }
        .swagger-ui section.models .model-toggle { color: #94A3B8; }
        .swagger-ui section.models .model-toggle::after { background: #64748B; }
        .swagger-ui .errors-wrapper { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 12px; color: #EF4444; }
        .swagger-ui .auth-wrapper .authorize { border: 1px solid #1E293B; border-radius: 8px; color: #94A3B8; font-weight: 600; font-size: 12px; padding: 6px 16px; background: #131722; }
        .swagger-ui .auth-wrapper .authorize:hover { border-color: #6366F1; color: #6366F1; }
        .swagger-ui .auth-container { border-bottom: 1px solid #1E293B; padding: 16px 0; }
        .swagger-ui .auth-container .auth-url input { background: #0A0E17; color: #F1F5F9; border: 1px solid #1E293B; border-radius: 8px; font-family: 'JetBrains Mono',monospace; }
        .swagger-ui .auth-container .flow span { color: #94A3B8; }
      `}</style>

      <div className="max-w-[1200px] mx-auto px-6 pt-8 pb-4">
        <a
          href="/docs/api"
          className="inline-flex items-center gap-1.5 text-[10px] text-muted-fg hover:text-primary transition-colors"
        >
          <ArrowLeft className="w-3 h-3" /> Back to API Reference
        </a>
        <h1 className="text-2xl font-extrabold tracking-tight mt-2 flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-primary" />
          </div>
          Swagger UI
        </h1>
        <p className="text-xs text-muted-fg mt-1">
          Interactive documentation for the SCAUDIT REST API. Try endpoints directly from your browser.
        </p>
      </div>

      <Suspense fallback={null}>
        <SwaggerLazyLoader />
      </Suspense>
    </div>
  );
}
