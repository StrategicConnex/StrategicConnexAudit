"use client";
import Link from "next/link";
import Image from "next/image";

export function Footer() {
  return (
    <footer>
      <div className="footer-grid">
        <div className="footer-brand">
          <Link href="/" className="logo">
            <Image src="/logo.webp" alt="Logo de Strategic Connex - Consultoría SEO y Posicionamiento en Buscadores" width={200} height={80} style={{ width: 'auto', height: '58px', objectFit: 'contain' }} className="logo-img" loading="lazy" />
            <span className="logo-text">STRATEGIC <span className="logo-light">CONNEX</span></span>
          </Link>
          <p>Agencia especializada en posicionamiento web estratégico y crecimiento orgánico. Optimizamos la visibilidad de empresas mediante SEO técnico de alta precisión y estrategias de contenido orientadas a resultados.</p>
        </div>
        <div className="footer-col">
          <h4>Servicios SEO</h4>
          <ul>
            <li><Link href="/posicionamiento-web">Posicionamiento Web</Link></li>
            <li><Link href="/auditoria-seo">Auditoría SEO</Link></li>
            <li><Link href="/seo-tecnico">SEO Técnico</Link></li>
            <li><Link href="/estrategia-seo">Estrategia SEO</Link></li>
            <li><Link href="/consultoria-seo">Consultoría SEO</Link></li>
          </ul>
        </div>
        <div className="footer-col">
          <h4>Recursos</h4>
          <ul>
            <li><Link href="/blog">Blog SEO</Link></li>
            <li><Link href="/#docs">Documentación</Link></li>
            <li><Link href="/#dashboard">ROI Dashboard</Link></li>
            <li><Link href="/#industries">Industrias</Link></li>
          </ul>
        </div>
        <div className="footer-col">
          <h4>Contacto</h4>
          <ul>
            <li><a href="mailto:contacto@strategicconnex.com">contacto@strategicconnex.com</a></li>
            <li><a href="#">LinkedIn</a></li>
            <li><Link href="/privacy">Privacidad</Link></li>
          </ul>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© <span>{new Date().getFullYear()}</span> <span>Strategic Connex</span>. Todos los derechos reservados.</span>
        <span>Operaciones en Neuquén Capital y soporte técnico para bases en Añelo. | Diseñado para liderar.</span>
      </div>
    </footer>
  );
}
