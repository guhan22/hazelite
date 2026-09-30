import type { Metadata, Viewport } from "next";
import { ServiceWorker } from "@/components/service-worker";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hazelite — Singapore haze monitor",
  description: "Live PSI and PM2.5 readings across Singapore's five regions, from NEA via data.gov.sg.",
  applicationName: "Hazelite",
  // iOS "Add to Home Screen": open full-screen with its own name (icon comes from app/apple-icon.png).
  appleWebApp: { capable: true, title: "Hazelite", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  // Draw edge to edge so env(safe-area-inset-*) reports the notch and home indicator; the page pads for them.
  viewportFit: "cover",
  // Browser/app chrome matches the page background in each colour scheme.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f9f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0d" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme script sets data-theme before hydration, so the attribute can differ from the server's.
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
