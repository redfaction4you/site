import type { Metadata, Viewport } from "next";
import { Black_Ops_One, Chakra_Petch } from "next/font/google";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

import "./globals.css";

// Same pairing as the RF4U CTF Tournament Hub.
const chakra = Chakra_Petch({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-chakra",
  display: "swap",
});

const blackOps = Black_Ops_One({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-blackops",
  display: "swap",
});

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://redfaction4you.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "RedFaction4You",
    template: "%s · RedFaction4You",
  },
  description:
    "A community archive for Red Faction (2001): maps, mods, tools, guides and videos, in one place that stays up.",
  icons: { icon: "/icon.png" },
  openGraph: {
    type: "website",
    siteName: "RedFaction4You",
    // No title or description here on purpose.
    //
    // Metadata is inherited, so anything set at the root wins on every page
    // that does not override it — which is why a Discord link to /players used
    // to unfurl as "a community archive for Red Faction: maps, mods, tools...".
    // Leaving these out lets each page's own title and description populate the
    // preview instead.
  },
  twitter: { card: "summary" },
};

export const viewport: Viewport = {
  themeColor: "#0c0c10",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${chakra.variable} ${blackOps.variable}`}>
      <body className="flex min-h-dvh flex-col font-sans antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-rust-500 focus:px-4 focus:py-2 focus:text-steel-100"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
