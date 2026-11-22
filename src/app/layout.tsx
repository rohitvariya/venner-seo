import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Venner SEO",
  description: "AI SEO content, publishing and tracking for local businesses",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
