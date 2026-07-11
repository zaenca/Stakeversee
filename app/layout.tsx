import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stakeverse",
  description: "A command center for controlled, optimized and profitable betting workflows."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
