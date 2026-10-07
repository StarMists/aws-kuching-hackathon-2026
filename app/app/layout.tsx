import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AITLAU — Knowledge in context",
  description: "Find documents, inspect source evidence, and investigate the whole picture in a private knowledge workspace.",
  other: {
    "codex-preview": "development",
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
      <body className="antialiased">{children}</body>
    </html>
  );
}
