import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Transaction Coordinator",
  description: "Autonomous AI transaction coordination for Texas real estate agents."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
