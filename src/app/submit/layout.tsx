import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Register",
};

export default function SubmitLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
