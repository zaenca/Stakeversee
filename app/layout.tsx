import type { Metadata } from "next";
import { BankBetMirror } from "./bank-bet-mirror";
import { CalendarBetsModal } from "./calendar-bets-modal";
import "./globals.css";
import "./coupon-force.css";
import "./bank-bet-mirror.css";
import "./calendar-bets-modal.css";

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
        <BankBetMirror />
        <CalendarBetsModal />
      </body>
    </html>
  );
}