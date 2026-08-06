import type { Metadata, Viewport } from "next";
import { Black_Ops_One, Chakra_Petch } from "next/font/google";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SITE_URL } from "@/lib/site";

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

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "RedFaction4You",
    template: "%s · RedFaction4You",
  },
  /*
   * What is actually here, not what is planned.
   *
   * This described the file catalogue, which is built but empty and hidden from
   * the navigation, so every link preview promised maps, mods and guides and led
   * to a match archive. The footer was already fixed; this is the copy that
   * unfurls in Discord, which is where most people meet the site first.
   */
  description:
    "A community archive for Red Faction (2001): match results, nightly write-ups, player records and the community server, in one place that stays up.",
  icons: { icon: "/icon.png" },
  openGraph: {
    type: "website",
    siteName: "RedFaction4You",
    // No title or description here on purpose.
    //
    // Metadata is inherited, so anything set at the root wins on every page
    // that does not override it, which is why a Discord link to /players used
    // to unfurl as "a community archive for Red Faction: maps, mods, tools...".
    // Leaving these out lets each page's own title and description populate the
    // preview instead.
  },
  twitter: { card: "summary" },
};

export const viewport: Viewport = {
  // Both, so the browser chrome follows whichever theme is in use rather than
  // framing a light page in a dark bar.
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0c0c10" },
    { media: "(prefers-color-scheme: light)", color: "#f4f2ee" },
  ],
  colorScheme: "dark light",
};

/**
 * Applies the stored theme before the first paint.
 *
 * Has to be inline and blocking. Doing it in a component means React runs after
 * the browser has already painted, so anyone who chose light mode would watch
 * the site load dark and then flip, on every single navigation. Small enough to
 * cost nothing, and it fails silently to dark, which is the default anyway.
 */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("rf4u-theme");if(!t){t=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="dark"}})()`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${chakra.variable} ${blackOps.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-dvh flex-col font-sans antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-rust-500 focus:px-4 focus:py-2 focus:text-white"
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
