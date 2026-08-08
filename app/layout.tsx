import type { Metadata } from "next";
import "./globals.css";
import "./coupon-force.css";
import { LanguageProvider } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Stakeversee",
  description: "A command center for controlled, optimized and profitable betting workflows.",
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
