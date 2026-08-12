import Link from "next/link";

import { getAllPosts } from "@/lib/posts";

export default async function HomePage() {
  // 이전 홈은 카드 두 개가 통째로 복붙되어 있었고, 글을 추가하려면 JSX를 고쳐야 했다.
  const posts = await getAllPosts();

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">글 목록</h1>

      {posts.length === 0 ? (
        <p className="mt-8 text-slate-500 dark:text-slate-400">아직 글이 없습니다.</p>
      ) : (
        <ul className="mt-8 divide-y divide-slate-200 dark:divide-slate-800">
          {posts.map((post) => (
            <li key={post.slug} className="py-6">
              <article>
                <h2 className="text-lg font-medium">
                  <Link href={`/posts/${post.slug}`} className="hover:underline">
                    {post.title}
                  </Link>
                </h2>

                <p className="mt-1 text-slate-600 dark:text-slate-400">{post.description}</p>

                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-500 dark:text-slate-400">
                  <time dateTime={post.date}>{post.date}</time>
                  {post.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
