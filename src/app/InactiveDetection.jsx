"use client";

import { useEffect, useRef } from "react";

export default function InactiveDetection() {
  const timeoutRef = useRef(null);

  useEffect(() => {
    const detectInactive = () => {
      document.body.classList.remove("inactive");

      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        document.body.classList.add("inactive");
      }, 1500);
    };

    window.addEventListener("pointermove", detectInactive);

    return () => {
      window.removeEventListener("pointermove", detectInactive);
      clearTimeout(timeoutRef.current);
    };
  }, []);

  return null;
}
