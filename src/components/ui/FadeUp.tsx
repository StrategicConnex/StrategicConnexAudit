"use client";
import { motion } from "framer-motion";

export const FadeUp = ({ children, className = "", delay = 0, style = {}, ...props }) => (
  <motion.div
    initial={{ opacity: 0, y: 24 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: "0px 0px -100px 0px" }}
    transition={{ duration: 0.8, delay }}
    className={className}
    style={style}
    {...props}
  >
    {children}
  </motion.div>
);
