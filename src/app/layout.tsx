import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stephanie Transaction Coordinator",
  description: "A transaction coordinator for residential real estate agents."
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
