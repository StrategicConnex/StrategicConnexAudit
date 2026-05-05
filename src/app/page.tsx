import React from "react";
import dynamic from "next/dynamic";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { BackToTop } from "@/components/layout/BackToTop";
import { CustomCursor } from "@/components/layout/CustomCursor";
import { FloatingWP } from "@/components/layout/FloatingWP";

import { Hero } from "@/components/sections/Hero";
import { About } from "@/components/sections/About";
import { Services } from "@/components/sections/Services";
import { Docs } from "@/components/sections/Docs";
import { Industries } from "@/components/sections/Industries";
import { KPI } from "@/components/sections/KPI";
import { Dashboard } from "@/components/sections/Dashboard";
import { CTA } from "@/components/sections/CTA";

const EnergyTrails3D = dynamic(
  () => import("@/components/ui/EnergyTrails3D").then((mod) => mod.EnergyTrails3D),
  { ssr: false }
);
export default function Page() {
  return (
    <>
      <div className="global-page-bg" aria-hidden={true}>
        <div className="hero-grid"></div>
        <div className="hero-glow"></div>
        <EnergyTrails3D />
      </div>
      <Navbar />
      <main>
        <Hero />
        <About />
        <Services />
        <Docs />
        <Industries />
        <KPI />
        <Dashboard />
      </main>
      <CTA />
      <Footer />
      <FloatingWP />
      <BackToTop />
      <CustomCursor />
    </>
  );
}
