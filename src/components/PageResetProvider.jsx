"use client";

import { createContext, useContext, useState } from "react";

const PageResetContext = createContext(null);

// Clicking the nav link for the page you are already on reads as "start over", but it is
// not a navigation, so no component unmounts and nothing clears page state by itself.
// Nav publishes a reset here and pages that hold ephemeral state listen for it.
//
// Not needed for state that lives in the URL - see Search, which reconciles against the
// search param instead and so also handles browser back/forward.
export function PageResetProvider({ children }) {
  const [resetToken, setResetToken] = useState(0);
  const requestPageReset = () => setResetToken(token => token + 1);

  return (
    <PageResetContext.Provider value={{ resetToken, requestPageReset }}>
      {children}
    </PageResetContext.Provider>
  );
}

export function usePageReset() {
  return useContext(PageResetContext);
}
