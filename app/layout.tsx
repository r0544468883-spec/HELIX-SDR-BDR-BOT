import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { Roboto_Mono } from "next/font/google";
import ColorStyles from "@/components/shared/color-styles/color-styles";
import Scrollbar from "@/components/ui/scrollbar";
import { Toaster } from "sonner";
import "@/styles/main.css";

const robotoMono = Roboto_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-roboto-mono",
});

export const metadata: Metadata = {
  title: "HELIX SDR",
  description: "סוכן SDR/BDR — העשרת לידים ופנייה חכמה, own-first, בעברית",
  // Favicon comes from app/icon.svg (green HELIX circle). No Firecrawl favicon.
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <ColorStyles />
      </head>
      <body
        className={`${GeistMono.variable} ${robotoMono.variable} font-sans text-accent-black bg-background-base overflow-x-clip`}
      >
        <main className="overflow-x-clip">{children}</main>
        <Scrollbar />
        <Toaster />
      </body>
    </html>
  );
}
