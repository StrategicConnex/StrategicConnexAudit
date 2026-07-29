import React from "react";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import fs from "fs";
import path from "path";

/* --- Tipado ------------------------------------------------------------ */

interface Props {
  params: Promise<{ slug: string[] }>;
}

/* --- Map slug → file path ---------------------------------------------- */

const DOCS_DIR = path.join(process.cwd(), "docs");

const SLUG_MAP: Record<string, string> = {
  installation: "installation.md",
  api: "api.md",
  security: "security.md",
  changelog: "CHANGELOG.md",
  "architecture/pipeline-history": "architecture/PIPELINE-HISTORY.md",
  "guides/alerting-setup": "guides/alerting-setup.md",
  "improvements/roadmap": "improvements/ROADMAP.md",
  "improvements/competitive-analysis": "improvements/COMPETITIVE-ANALYSIS.md",
};

/* --- Preprocesamiento Jekyll → Markdown limpio ------------------------ */

function stripFrontMatter(raw: string): string {
  return raw.replace(/^---[\s\S]*?---\n*/, "");
}

function stripJekyllSyntax(raw: string): string {
  return raw
    // {: .note }, {: .tip }, {: .warning }, {: .important }, {: .no_toc }
    .replace(/\{:\s*\.[a-zA-Z_-]+\s*\}/g, "")
    // {:toc}
    .replace(/\{:\s*toc\s*\}/g, "")
    // 1. TOC (ordered list marker for Jekyll TOC)
    .replace(/^1\.\s+TOC\s*$/gm, "")
    // <details markdown="block"> → <details>
    .replace(/<details\s+markdown="block">/g, "<details>")
    // {: .text-delta } inline
    .replace(/\{:\s*\.text-delta\s*\}/g, "")
    // {: .label } and variants
    .replace(/\{:\s*\.[a-zA-Z0-9_-]+\s*}/g, "")
    // {% raw %} / {% endraw %}
    .replace(/\{%\s*raw\s*%\}/g, "")
    .replace(/\{%\s*endraw\s*%\}/g, "");
}

function preprocessMarkdown(raw: string): string {
  let content = stripFrontMatter(raw);
  content = stripJekyllSyntax(content);
  return content;
}

/* --- Slug resolution --------------------------------------------------- */

function resolveFilePath(slug: string[]): string | null {
  const joined = slug.join("/");
  const relativePath = SLUG_MAP[joined];
  if (relativePath) {
    return path.join(DOCS_DIR, relativePath);
  }

  // Fallback: try direct file match
  const directPath = path.join(DOCS_DIR, ...slug) + ".md";
  if (fs.existsSync(directPath)) {
    return directPath;
  }

  // Fallback: try file in subdirectory
  const altPath = path.join(DOCS_DIR, ...slug, "index.md");
  if (fs.existsSync(altPath)) {
    return altPath;
  }

  return null;
}

function extractTitle(raw: string): string {
  // Try to get title from front matter
  const titleMatch = raw.match(/^---[\s\S]*?title:\s*(.+?)[\s\S]*?---/);
  if (titleMatch) return titleMatch[1].replace(/"/g, "");
  // Try first H1
  const h1Match = raw.match(/^#\s+(.+)/m);
  if (h1Match) return h1Match[1];
  return "Documentación";
}

/* --- Página ------------------------------------------------------------ */

export default async function DocPage({ params }: Props) {
  const { slug } = await params;
  const filePath = resolveFilePath(slug);

  if (!filePath || !fs.existsSync(filePath)) {
    notFound();
  }

  const rawContent = fs.readFileSync(filePath, "utf-8");
  const title = extractTitle(rawContent);
  const content = preprocessMarkdown(rawContent);

  return (
    <article className="prose-custom animate-fade-in">
      {/* Mobile breadcrumb */}
      <div className="flex items-center gap-2 text-[12px] text-muted-fg mb-6 md:hidden">
        <a href="/docs" className="hover:text-primary transition-colors">Docs</a>
        <span>/</span>
        <span className="truncate max-w-[200px]">{title}</span>
      </div>

      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children, ...props }) => (
            <h1 className="text-display mb-6 mt-2" {...props}>
              {children}
            </h1>
          ),
          h2: ({ children, ...props }) => (
            <h2
              className="text-[20px] font-bold tracking-tight mt-10 mb-4 pb-2 border-b border-border/50"
              {...props}
            >
              {children}
            </h2>
          ),
          h3: ({ children, ...props }) => (
            <h3 className="text-[16px] font-bold tracking-tight mt-8 mb-3" {...props}>
              {children}
            </h3>
          ),
          h4: ({ children, ...props }) => (
            <h4 className="text-[14px] font-bold tracking-tight mt-6 mb-2" {...props}>
              {children}
            </h4>
          ),
          p: ({ children, ...props }) => (
            <p className="text-[14.5px] leading-relaxed text-foreground/80 mb-4" {...props}>
              {children}
            </p>
          ),
          a: ({ href, children, ...props }) => (
            <a
              href={href}
              className="text-primary hover:text-primary/80 underline underline-offset-2 decoration-primary/30 hover:decoration-primary/60 transition-all"
              target={href?.startsWith("http") ? "_blank" : undefined}
              rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
              {...props}
            >
              {children}
            </a>
          ),
          code: ({ children, className, ...props }: any) => {
            const isInline = !className;
            return isInline ? (
              <code
                className="bg-muted/40 text-[13px] px-1.5 py-0.5 rounded border border-border/30 font-mono"
                {...props}
              >
                {children}
              </code>
            ) : (
              <code
                className="block bg-muted/30 text-[13px] p-4 rounded-xl border border-border/30 font-mono overflow-x-auto whitespace-pre-wrap my-4 leading-relaxed"
                {...props}
              >
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <div className="relative group my-4">
              {children}
            </div>
          ),
          table: ({ children, ...props }) => (
            <div className="overflow-x-auto my-6 rounded-xl border border-border/50">
              <table className="w-full text-[13px]" {...props}>
                {children}
              </table>
            </div>
          ),
          thead: ({ children, ...props }) => (
            <thead className="bg-muted/20 border-b border-border/50" {...props}>
              {children}
            </thead>
          ),
          th: ({ children, ...props }) => (
            <th className="text-left px-4 py-3 font-bold text-muted-fg text-[11px] uppercase tracking-wider" {...props}>
              {children}
            </th>
          ),
          td: ({ children, ...props }) => (
            <td className="px-4 py-3 border-t border-border/30 text-foreground/80" {...props}>
              {children}
            </td>
          ),
          ul: ({ children, ...props }) => (
            <ul className="space-y-1.5 my-4 pl-5 list-disc marker:text-muted-fg" {...props}>
              {children}
            </ul>
          ),
          ol: ({ children, ...props }) => (
            <ol className="space-y-1.5 my-4 pl-5 list-decimal marker:text-muted-fg" {...props}>
              {children}
            </ol>
          ),
          li: ({ children, ...props }) => (
            <li className="text-[14.5px] leading-relaxed text-foreground/80 pl-1" {...props}>
              {children}
            </li>
          ),
          blockquote: ({ children, ...props }) => (
            <blockquote
              className="border-l-4 border-primary/30 pl-4 my-6 py-2 bg-primary/5 rounded-r-xl text-[14px] text-foreground/70 italic"
              {...props}
            >
              {children}
            </blockquote>
          ),
          hr: ({ ...props }) => (
            <hr className="my-10 border-border/30" {...props} />
          ),
          img: ({ src, alt, ...props }) => (
            <img
              src={src}
              alt={alt || ""}
              className="rounded-xl my-6 max-w-full border border-border/30"
              loading="lazy"
              {...props}
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
}

/* --- Generación estática ----------------------------------------------- */

export async function generateStaticParams() {
  return Object.keys(SLUG_MAP).map((key) => ({
    slug: key.split("/"),
  }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const filePath = resolveFilePath(slug);
  if (!filePath) return { title: "Documentación - SCAUDIT Pro" };

  const raw = fs.readFileSync(filePath, "utf-8");
  const title = extractTitle(raw);
  return {
    title: `${title} - SCAUDIT Pro`,
    description: `Documentación de SCAUDIT Pro: ${title}`,
  };
}
