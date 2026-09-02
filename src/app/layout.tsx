import type { Metadata } from "next";
import { Newsreader, Space_Mono, Work_Sans } from "next/font/google";
import "./globals.css";

const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-newsreader" });
const workSans = Work_Sans({ subsets: ["latin"], variable: "--font-work-sans" });
const spaceMono = Space_Mono({ subsets: ["latin"], variable: "--font-space-mono", weight: ["400", "700"] });

export const metadata: Metadata = {
  title: { default: "Memories Wall", template: "%s · Memories Wall" },
  description: "A quiet, tactile place for the moments that shape you.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${newsreader.variable} ${workSans.variable} ${spaceMono.variable}`}>{children}</body></html>;
}
