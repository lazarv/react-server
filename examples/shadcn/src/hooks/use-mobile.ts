import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  type IsMobileState = boolean | undefined;
  const [isMobile, setIsMobile] = React.useState<IsMobileState>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}
