"use client";
import React, { useState, useEffect, useRef } from "react";
import { animate, useInView } from "framer-motion";

export function Counter({ from = 0, to, duration = 2.5, isFloat = false }) {
  const [count, setCount] = useState(from);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -100px 0px" });

  useEffect(() => {
    if (inView) {
      const controls = animate(from, to, {
        duration,
        ease: "easeOut",
        onUpdate(value) {
          setCount(isFloat ? value.toFixed(1) : Math.floor(value));
        }
      });
      return () => controls.stop();
    }
  }, [from, to, inView, duration, isFloat]);

  return <span ref={ref}>{count}</span>;
}
