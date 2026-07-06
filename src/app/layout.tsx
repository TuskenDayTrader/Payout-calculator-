import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tradeify Payout & Risk Utility Calculator",
  description:
    "Mobile-first Tradeify calculator for payout eligibility, consistency, drawdown safety, and cycle planning.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full antialiased">
      <body className="min-h-full bg-[var(--background)] text-[var(--foreground)]">
        {children}
      </body>
    </html>
  );
}
