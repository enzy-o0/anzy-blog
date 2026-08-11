import type { Metadata } from "next";

import { getAllPosts, getPost, getPostSlugs } from "@/lib/posts";

type PageProps = { params: Promise<{ slug: string }> };

/** generateStaticParams 밖의 slug는 404. 목록의 진실은 파일시스템 하나뿐이다. */
export const dynamicParams = false;

export async function generateStaticParams() {
  // 이전 구현은 [{ id: "grid" }, { id: "text" }]가 하드코딩되어 있어
  // 글을 추가할 때마다 페이지 코드를 고쳐야 했다.
  const slugs = await getPostSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);

  return {
    title: post.title,
    description: post.description,
  };
}

export default async function PostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = await getPost(slug);

  return (
    <article>
      <header className="border-b border-slate-200 pb-6 dark:border-slate-800">
        <h1 className="text-3xl font-semibold tracking-tight">{post.title}</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">{post.description}</p>
        <div className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          <time dateTime={post.date}>{post.date}</time>
          <span className="mx-2">·</span>
          <span>{post.author}</span>
        </div>
      </header>

      {/*
        renderMarkdown은 remark-rehype를 allowDangerousHtml 없이 쓰므로
        마크다운 원문의 raw HTML은 파이프라인에서 이미 제거된 상태다.
      */}
      <div
        className="prose prose-slate mt-8 max-w-none dark:prose-invert"
        dangerouslySetInnerHTML={{ __html: post.contentHtml }}
      />
    </article>
  );
}
