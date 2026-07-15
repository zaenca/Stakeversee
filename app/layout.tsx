import type { Metadata } from "next";
import "./globals.css";
import "./coupon-force.css";

export const metadata: Metadata = {
  title: "Stakeversee",
  description: "A command center for controlled, optimized and profitable betting workflows."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>
        {children}
      </body>
    </html>
  );
}