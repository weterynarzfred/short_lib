"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

const PageResetContext = createContext(null);

const NO_PROVIDER = { resetToken: 0, requestPageReset: () => { } };

// Clicking the nav link for the page you are already on reads as "start over", but it is
// not a navigation, so no component unmounts and nothing clears page state by itself.
// Nav publishes a reset here and pages that hold ephemeral state listen for it.
//
// Not needed for state that lives in the URL - see Search, which reconciles against the
// search param instead and so also handles browser back/forward.
export function PageResetProvider({ children }) {
  const [resetToken, setResetToken] = useState(0);

  const requestPageReset = useCallback(() => {
    setResetToken(token => token + 1);
  }, []);

  const value = useMemo(
    () => ({ resetToken, requestPageReset }),
    [resetToken, requestPageReset]
  );

  return <PageResetContext.Provider value={value}>{children}</PageResetContext.Provider>;
}

export function usePageReset() {
  return useContext(PageResetContext) ?? NO_PROVIDER;
}
