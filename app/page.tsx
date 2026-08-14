import Link from "next/link";

import { getAllPosts } from "@/lib/posts";
import { site } from "@/lib/site";

export default async function HomePage() {
  // 이전 홈은 카드 두 개가 통째로 복붙되어 있었고, 글을 추가하려면 JSX를 고쳐야 했다.
  const posts = await getAllPosts();

  return (
    <div>
      {/* 방문자가 처음 보는 화면이라 "누구인지"가 먼저 나온다. 글 목록은 그다음. */}
      <section className="border-b border-slate-200 pb-10 dark:border-slate-800">
        <h1 className="text-3xl font-semibold tracking-tight">{site.name}</h1>
        {/* 링크는 헤더에 있다. 홈에서 또 보여주면 중복이다. */}
        <p className="mt-3 text-lg text-slate-600 dark:text-slate-400">{site.bio}</p>
      </section>

      <h2 className="mt-12 text-sm font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
        글 {posts.length}편
      </h2>

      {posts.length === 0 ? (
        <p className="mt-6 text-slate-500 dark:text-slate-400">아직 글이 없습니다.</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
          {posts.map((post) => (
            <li key={post.slug} className="py-6">
              <article>
                <h3 className="text-lg font-medium">
                  <Link href={`/posts/${post.slug}`} className="hover:underline">
                    {post.title}
                  </Link>
                </h3>

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
