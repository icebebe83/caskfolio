import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Bottle Detail",
};

export default function BottleLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
