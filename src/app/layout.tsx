import type { Metadata } from "next";

import "@/app/globals.css";
import { AgeVerificationModal } from "@/components/age-verification-modal";
import { Providers } from "@/components/providers";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3008"),
  title: {
    default: "Caskfolio",
    template: "%s · Caskfolio",
  },
  description: "Collector-focused bottle price index and market archive for spirits.",
  applicationName: "Caskfolio",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    title: "Caskfolio",
    capable: true,
    statusBarStyle: "default",
  },
  openGraph: {
    title: "Caskfolio",
    description: "Collector-focused bottle price index and market archive for spirits.",
    siteName: "Caskfolio",
    type: "website",
    images: [
      {
        url: "/caskfolio-share.svg",
        width: 1200,
        height: 630,
        alt: "Caskfolio collector bottle price index",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Caskfolio",
    description: "Collector-focused bottle price index and market archive for spirits.",
    images: ["/caskfolio-share.svg"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="min-h-screen">
            <AgeVerificationModal />
            <SiteHeader />
            <main className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 pb-20 pt-6 sm:px-6 lg:px-8">
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
