import { useState, useEffect } from "react";

export function useWindowSize() {
  const [size, setSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  useEffect(() => {
    let raf;
    const handle = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() =>
        setSize({ width: window.innerWidth, height: window.innerHeight })
      );
    };
    window.addEventListener("resize", handle);
    return () => { window.removeEventListener("resize", handle); cancelAnimationFrame(raf); };
  }, []);

  return size;
}

// Breakpoints
export const BP = {
  mobile: 640,
  tablet: 900,
  desktop: 1200,
};
