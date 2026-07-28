"use client";
import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useCursorStore } from "@/lib/store/useCursorStore";

export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const setHovering = useCursorStore((state) => state.setHovering);

  return (
    <header>
      <div className="nav-inner">
        <Link 
          href="/" 
          className="logo" 
          onMouseEnter={() => setHovering(true)} 
          onMouseLeave={() => setHovering(false)}
        >
          <Image src="/logo.webp" alt="Logo de Strategic Connex - Consultoría SEO y Posicionamiento en Buscadores" width={200} height={80} style={{ width: 'auto', height: '58px', objectFit: 'contain' }} className="logo-img" priority />
          <span className="logo-text">STRATEGIC <span className="logo-light">CONNEX</span></span>
        </Link>
        <ul className={`nav-links ${menuOpen ? 'active' : ''}`}>
          <li><Link href="/#about" onClick={() => setMenuOpen(false)}>Nosotros</Link></li>
          <li><Link href="/#services" onClick={() => setMenuOpen(false)}>Servicios</Link></li>
          <li><Link href="/blog" onClick={() => setMenuOpen(false)}>Blog</Link></li>
          <li><Link href="/#docs" onClick={() => setMenuOpen(false)}>Documentación</Link></li>
          <li><Link href="/#industries" onClick={() => setMenuOpen(false)}>Industrias</Link></li>
          <li><Link href="/#dashboard" onClick={() => setMenuOpen(false)}>Dashboard</Link></li>
          <li><Link href="/#cta" className="nav-cta" onClick={() => setMenuOpen(false)}>Contactar</Link></li>
        </ul>
        <button className="mobile-menu-btn" aria-expanded={menuOpen} aria-label="Abrir menú" onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? '✕' : '☰'}
        </button>
      </div>
    </header>
  );
}
