"use client";

import { useEffect, useState } from "react";

/** Reveals `text` one character per `stepMs`; reduced motion shows it whole. */
export function useTypewriter(text: string, stepMs: number) {
  const [length, setLength] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setLength(text.length);
      return;
    }
    setLength(0);
    const timer = window.setInterval(() => {
      setLength((current) => {
        if (current >= text.length) {
          window.clearInterval(timer);
          return current;
        }
        return current + 1;
      });
    }, stepMs);
    return () => window.clearInterval(timer);
  }, [text, stepMs]);
  return text.slice(0, length);
}
