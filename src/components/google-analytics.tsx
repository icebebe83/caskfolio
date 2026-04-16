"use client";

import Script from "next/script";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

declare global {
  interface Window {
    dataLayer: Record<string, unknown>[];
    gtag?: (...args: unknown[]) => void;
  }
}

const GA_MEASUREMENT_ID = "G-QHSBEDEN92";

export function GoogleAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.gtag !== "function") return;

    const search = window.location.search;
    const pagePath = `${pathname}${search}`;

    window.gtag("config", GA_MEASUREMENT_ID, {
      page_path: pagePath,
    });
  }, [pathname]);

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-base" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}', {
            send_page_view: true,
          });
        `}
      </Script>
    </>
  );
}
