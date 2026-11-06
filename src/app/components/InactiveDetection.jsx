"use client";

import { useEffect } from "react";

export default function InactiveDetection() {
  useEffect(() => {
    let timeout;

    const detectInactive = () => {
      document.body.classList.remove("inactive");

      clearTimeout(timeout);
      timeout = setTimeout(() => {
        document.body.classList.add("inactive");
      }, 1500);
    };

    window.addEventListener("pointermove", detectInactive);

    return () => {
      window.removeEventListener("pointermove", detectInactive);
      clearTimeout(timeout);
    };
  }, []);

  return null;
}
