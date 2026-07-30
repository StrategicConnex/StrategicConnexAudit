export class TechProfilerExecutor {
  async execute(domain: string) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(`https://${domain}`, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'StrategicAuditBot/1.0',
        },
      });
      clearTimeout(timeoutId);

      const headers = response.headers;
      const technologies: Array<{ name: string; category: string; confidence: number }> = [];

      // Basic Header Profiling
      const server = headers.get('server');
      if (server) {
        if (server.includes('nginx')) technologies.push({ name: 'Nginx', category: 'Web Server', confidence: 0.95 });
        if (server.includes('apache')) technologies.push({ name: 'Apache', category: 'Web Server', confidence: 0.95 });
        if (server.includes('cloudflare')) technologies.push({ name: 'Cloudflare', category: 'CDN', confidence: 0.99 });
      }

      const poweredBy = headers.get('x-powered-by');
      if (poweredBy) {
        if (poweredBy.includes('Express')) technologies.push({ name: 'Express', category: 'Web Framework', confidence: 0.95 });
        if (poweredBy.includes('Next.js')) technologies.push({ name: 'Next.js', category: 'Web Framework', confidence: 0.95 });
        if (poweredBy.includes('PHP')) technologies.push({ name: 'PHP', category: 'Programming Language', confidence: 0.95 });
      }

      // Read some body to profile meta tags (only taking first chunk for speed)
      const bodyChunk = await response.text();
      const metaGeneratorMatch = bodyChunk.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i);
      if (metaGeneratorMatch && metaGeneratorMatch[1]) {
        technologies.push({ name: metaGeneratorMatch[1], category: 'CMS / Generator', confidence: 0.9 });
      }

      if (bodyChunk.includes('wp-content')) {
        technologies.push({ name: 'WordPress', category: 'CMS', confidence: 0.95 });
      }
      
      if (bodyChunk.includes('__NEXT_DATA__')) {
        technologies.push({ name: 'Next.js', category: 'Web Framework', confidence: 0.99 });
      }

      // Deduplicate
      const uniqueTech = technologies.filter((t, index, self) => 
        index === self.findIndex((t2) => t2.name.toLowerCase() === t.name.toLowerCase())
      );

      return {
        success: true,
        technologies: uniqueTech
      };
    } catch (error) {
      console.error(`TechProfiler failed for ${domain}:`, error);
      return { success: false, error: "Failed to profile technologies" };
    }
  }
}
