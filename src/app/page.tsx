"use client";
import React, { useState } from "react";
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

export default function Page() {
  const [isHovering, setIsHovering] = useState(false);

  const handleInteractEnter = () => setIsHovering(true);
  const handleInteractLeave = () => setIsHovering(false);

  return (
    <>
      <Navbar onEnter={handleInteractEnter} onLeave={handleInteractLeave} />
      <main>
        <Hero onEnter={handleInteractEnter} onLeave={handleInteractLeave} />
        <About />
        <Services />
        <Docs />
        <Industries onEnter={handleInteractEnter} onLeave={handleInteractLeave} />
        <KPI />
        <Dashboard />
      </main>
      <CTA onEnter={handleInteractEnter} onLeave={handleInteractLeave} />
      <Footer />
      <FloatingWP onEnter={handleInteractEnter} onLeave={handleInteractLeave} />
      <BackToTop />
      <CustomCursor isHovering={isHovering} />
    </>
  );
}
