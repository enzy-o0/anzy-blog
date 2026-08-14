import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { site } from "@/lib/site";

import "highlight.js/styles/github-dark.css";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: site.title,
    template: `%s · ${site.title}`,
  },
  description: site.description,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body className="flex min-h-dvh flex-col bg-white text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
          <nav className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-4">
            <Link href="/" className="font-semibold tracking-tight hover:underline">
              {site.name}
            </Link>
            <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
              {site.links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="hover:text-slate-900 hover:underline dark:hover:text-slate-100"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </nav>
        </header>

        {/* flex-1로 본문이 짧아도 푸터가 화면 하단에 붙는다. 글이 한 편일 때 특히 티가 난다. */}
        <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">{children}</main>

        <footer className="border-t border-slate-200 dark:border-slate-800">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-6 py-6 text-sm text-slate-500 dark:text-slate-400">
            <span>© {site.name}</span>
            <a
              href={site.links[1].href}
              className="hover:text-slate-900 hover:underline dark:hover:text-slate-100"
            >
              이 사이트는 Next.js로 만들었고 소스는 공개되어 있습니다
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
