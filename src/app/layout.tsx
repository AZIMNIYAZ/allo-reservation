import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Allo — Inventory Reservation",
  description: "Real-time inventory reservation platform for multi-warehouse retail.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased bg-slate-50 text-slate-900`}>
        <main className="min-h-screen">
          <header className="border-b bg-white sticky top-0 z-50">
            <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">
                  A
                </div>
                <span className="font-semibold text-lg tracking-tight">Allo</span>
              </div>
              <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Multi-Warehouse Reservation
              </div>
            </div>
          </header>
          {children}
        </main>
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
