"use client";
import Image from "next/image";

export function Footer() {
  return (
    <footer>
      <div className="footer-grid">
        <div className="footer-brand">
          <a href="#" className="logo">
            <Image src="/logo.png" alt="Strategic Connex Logo" width={200} height={80} style={{ width: 'auto', height: '58px', objectFit: 'contain' }} className="logo-img" />
            <span className="logo-text">STRATEGIC <span className="logo-light">CONNEX</span></span>
          </a>
          <p>Agencia especializada en posicionamiento web estratégico y crecimiento orgánico. Optimizamos la visibilidad de empresas mediante SEO técnico de alta precisión y estrategias de contenido orientadas a resultados.</p>
        </div>
        <div className="footer-col">
          <h4>Servicios SEO</h4>
          <ul>
            <li><a href="/posicionamiento-web">Posicionamiento Web</a></li>
            <li><a href="/auditoria-seo">Auditoría SEO</a></li>
            <li><a href="/seo-tecnico">SEO Técnico</a></li>
            <li><a href="/estrategia-seo">Estrategia SEO</a></li>
            <li><a href="/consultoria-seo">Consultoría SEO</a></li>
          </ul>
        </div>
        <div className="footer-col">
          <h4>Recursos</h4>
          <ul>
            <li><a href="/blog">Blog SEO</a></li>
            <li><a href="/#docs">Documentación</a></li>
            <li><a href="/#dashboard">ROI Dashboard</a></li>
            <li><a href="/#industries">Industrias</a></li>
          </ul>
        </div>
        <div className="footer-col">
          <h4>Contacto</h4>
          <ul>
            <li><a href="mailto:contacto@strategicconnex.com">contacto@strategicconnex.com</a></li>
            <li><a href="#">LinkedIn</a></li>
            <li><a href="/privacy">Privacidad</a></li>
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
