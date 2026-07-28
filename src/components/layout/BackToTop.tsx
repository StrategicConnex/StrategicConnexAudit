"use client";
import React, { useState, useEffect } from "react";
import { useScroll } from "framer-motion";

export function BackToTop() {
  const { scrollY } = useScroll();
  const [showToTop, setShowToTop] = useState(false);

  useEffect(() => {
    return scrollY.on("change", (latest) => {
      setShowToTop(latest > 500);
    });
  }, [scrollY]);

  return (
    <a href="#" className={`back-to-top ${showToTop ? 'visible' : ''}`} aria-label="Volver arriba">↑</a>
  );
}
