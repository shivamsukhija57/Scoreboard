import type { Metadata, Viewport } from "next";
// Field Day's condensed display face for titles, scores and totals; body text uses the system font (San Francisco on
// Apple devices, Segoe UI on Windows), the Apple half of the Match Day direction.
import "@fontsource/big-shoulders-display/700";
import "@fontsource/big-shoulders-display/800";
import "@fontsource/big-shoulders-display/900";
import "./globals.css";
import { themeBootScript } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: "Division Wars",
  description: "Live scores, fixtures and standings for Division Wars: Ares, Bloodhounds, Cyappa, Dracarys and Eagles.",
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f2f2f7" }, { media: "(prefers-color-scheme: dark)", color: "#000000" }],
  colorScheme: "light dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // The theme attribute is set by the boot script before React hydrates, so it can legitimately differ from the server.
  return <html lang="en" suppressHydrationWarning>
    <head><script dangerouslySetInnerHTML={{ __html: themeBootScript }} /></head>
    <body>{children}</body>
  </html>;
}
