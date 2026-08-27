import { useBreakpoints } from '@vueuse/core';

const breakpoints = useBreakpoints({
  mobile: 0,
  tablet: 768,
  desktop: 1024,
});

export function useResponsive() {
  const isMobile = breakpoints.smaller('tablet');
  const isTablet = breakpoints.between('tablet', 'desktop');
  const isDesktop = breakpoints.greaterOrEqual('desktop');

  return {
    isMobile,
    isTablet,
    isDesktop,
  };
}
