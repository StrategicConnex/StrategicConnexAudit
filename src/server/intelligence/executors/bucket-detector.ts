import dns from 'dns/promises';
import { safeFetch } from '../security/egress-guard';

export class BucketDetectorExecutor {
  async execute(domain: string, aggressive: boolean = false) {
    try {
      const baseName = domain.split('.')[0]; // e.g. "example" from "example.com"
      
      let permutations = [baseName];
      if (aggressive) {
        permutations = [
          baseName,
          `${baseName}-dev`,
          `${baseName}-staging`,
          `${baseName}-assets`,
          `${baseName}-backup`,
          `${baseName}-prod`
        ];
      }

      const providers = [
        { name: 'AWS S3', suffix: 's3.amazonaws.com' },
        { name: 'Google Cloud Storage', suffix: 'storage.googleapis.com' },
        { name: 'Azure Blob', suffix: 'blob.core.windows.net' }
      ];

      const findings: Array<{ bucketUrl: string; provider: string; status: 'open' | 'protected' | 'not_found' }> = [];

      for (const perm of permutations) {
        for (const provider of providers) {
          const target = `${perm}.${provider.suffix}`;
          try {
            await dns.resolve(target);
            // If DNS resolves, bucket exists. Check HTTP status.
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            
            try {
              // safeFetch: egress-guard SSRF (el host derivado es público, pero
              // por defensa en profundidad también valida redirects y timeout).
              const res = await safeFetch(`http://${target}`, { signal: controller.signal });
              clearTimeout(timeoutId);
              
              if (res.status === 200) {
                findings.push({ bucketUrl: target, provider: provider.name, status: 'open' });
              } else if (res.status === 403) {
                findings.push({ bucketUrl: target, provider: provider.name, status: 'protected' });
              }
            } catch {
              clearTimeout(timeoutId);
              // Network error, maybe protected or no HTTP
              findings.push({ bucketUrl: target, provider: provider.name, status: 'protected' });
            }
          } catch (e: unknown) {
            // DNS resolution failed (NXDOMAIN), bucket doesn't exist
            const errCode = e instanceof Error ? (e as NodeJS.ErrnoException).code : undefined;
            if (errCode !== 'ENOTFOUND') {
              // Something else failed, ignore
            }
          }
        }
      }

      return {
        success: true,
        buckets: findings
      };
    } catch (error) {
      console.error(`BucketDetector failed for ${domain}:`, error);
      return { success: false, error: "Failed to detect buckets" };
    }
  }
}
