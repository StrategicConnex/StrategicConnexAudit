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
          <p>La Primera Consultora de Posicionamiento y Gestión Comercial Integral de Neuquén, especializada en industrias de alta complejidad. Precisión, control y resultados medibles.</p>
        </div>
        <div className="footer-col">
          <h4>Servicios</h4>
          <ul>
            <li><a href="#">Marketing Industrial</a></li>
            <li><a href="#">SEO / SEM</a></li>
            <li><a href="#">Branding</a></li>
            <li><a href="#">Consultoría</a></li>
            <li><a href="#">Desarrollo Web</a></li>
          </ul>
        </div>
        <div className="footer-col">
          <h4>Documentación</h4>
          <ul>
            <li><a href="#">Gestión de Legajos</a></li>
            <li><a href="#">Presupuestos</a></li>
            <li><a href="#">Ingeniería</a></li>
            <li><a href="#">Homologación</a></li>
          </ul>
        </div>
        <div className="footer-col">
          <h4>Contacto</h4>
          <ul>
            <li><a href="#">contacto@strategicconnex.com</a></li>
            <li><a href="#">LinkedIn</a></li>
            <li><a href="#">Política de privacidad</a></li>
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
