import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import "highlight.js/styles/github-dark.css";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Anzy 블로그",
    template: "%s · Anzy 블로그",
  },
  description: "마크다운으로 쓰고 빌드타임에 정적으로 굽는 개인 블로그",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-dvh bg-white text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
          <nav className="mx-auto flex max-w-3xl items-center gap-4 px-6 py-4">
            <Link href="/" className="font-semibold tracking-tight hover:underline">
              Anzy
            </Link>
            <span className="text-sm text-slate-500 dark:text-slate-400">블로그</span>
          </nav>
        </header>

        <main className="mx-auto max-w-3xl px-6 py-12">{children}</main>
      </body>
    </html>
  );
}
