import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/** Scroll the window to the top on every client-side route change. */
export function ScrollToTop() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname, search]);

  return null;
}
