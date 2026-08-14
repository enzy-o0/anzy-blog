import fs from "node:fs/promises";
import path from "node:path";

import matter from "gray-matter";

import { renderMarkdown } from "./markdown";
import { frontmatterSchema, type Frontmatter } from "./schema";

const POSTS_DIR = path.join(process.cwd(), "content", "posts");

export type PostSummary = Frontmatter & { slug: string };
export type Post = PostSummary & { contentHtml: string };

/** slug는 파일 이름에서 나온다. frontmatter가 아니라 파일시스템이 목록의 진실이다. */
export async function getPostSlugs(): Promise<string[]> {
  const entries = await fs.readdir(POSTS_DIR);
  return entries
    .filter((name) => name.endsWith(".md"))
    .map((name) => name.replace(/\.md$/, ""));
}

async function readPost(slug: string): Promise<{ frontmatter: Frontmatter; body: string }> {
  const raw = await fs.readFile(path.join(POSTS_DIR, `${slug}.md`), "utf8");

  // YAML이 깨지면 gray-matter가 던진다. 그대로 두면 어느 파일인지 모르는 에러가 나온다.
  // 제목에 따옴표를 쓰다 실제로 밟은 함정이라 파일명을 붙여 다시 던진다.
  let data: Record<string, unknown>;
  let content: string;
  try {
    ({ data, content } = matter(raw));
  } catch (error) {
    const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
    throw new Error(`content/posts/${slug}.md의 frontmatter YAML을 파싱하지 못했습니다: ${message}`);
  }

  const parsed = frontmatterSchema.safeParse(data);
  if (!parsed.success) {
    // 빌드를 세우는 편이 낫다. 조용히 통과시키면 목록에서 제목이 빈 칸으로 나갈 뿐이다.
    const detail = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`content/posts/${slug}.md의 frontmatter가 스키마와 맞지 않습니다:\n${detail}`);
  }

  return { frontmatter: parsed.data, body: content };
}

export async function getPost(slug: string): Promise<Post> {
  const { frontmatter, body } = await readPost(slug);
  return { ...frontmatter, slug, contentHtml: await renderMarkdown(body) };
}

/** 목록에는 본문이 필요 없으므로 마크다운을 렌더링하지 않는다. */
export async function getAllPosts(): Promise<PostSummary[]> {
  const slugs = await getPostSlugs();
  const posts = await Promise.all(
    slugs.map(async (slug) => {
      const { frontmatter } = await readPost(slug);
      return { ...frontmatter, slug };
    }),
  );

  return posts
    .filter((post) => !post.draft)
    .sort((a, b) => b.date.localeCompare(a.date));
}
