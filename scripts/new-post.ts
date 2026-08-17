/**
 * 새 글 파일을 만든다.
 *
 *   npm run new-post -- my-slug
 *   npm run new-post -- my-slug "글 제목"
 *
 * "쓰자"와 "쓴다" 사이의 마찰을 없애는 게 전부다. frontmatter를 매번 손으로 치면
 * 날짜를 틀리거나 draft를 빠뜨리고, 그러다 초안이 목록에 나가는 일이 생긴다.
 *
 * 만들어진 파일은 draft: true다. `npm run dev`로 미리보면서 쓰고,
 * 다 되면 draft를 false로 바꾼다.
 */

import fs from "node:fs/promises";
import path from "node:path";

import { site } from "../lib/site";

const POSTS_DIR = path.join(process.cwd(), "content", "posts");

/** 파일 이름이 곧 URL이다. 한글·공백·대문자는 주소에서 지저분해진다. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function today(): string {
  // 로컬 시간 기준. UTC로 뽑으면 한국에서 오전 9시 이전에 쓸 때 하루 전 날짜가 된다.
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function template(slug: string, title: string): string {
  // 키 순서는 lib/schema.ts의 정의 순서와 맞춘다. 파일마다 순서가 달라지면 diff가 지저분하다.
  return `---
title: ${JSON.stringify(title)}
description: TODO 한 줄 요약 — 목록과 검색 결과에 그대로 나갑니다
date: "${today()}"
categories: []
tags: []
author: ${JSON.stringify(site.name)}
draft: true
---

여기서부터 씁니다.

코드펜스에는 언어를 꼭 적습니다. 자동 감지가 꺼져 있어서, 빠뜨리면 색이 입혀지지
않는데 빌드는 그냥 통과합니다.

\`\`\`ts
const x = 1;
\`\`\`
`;
}

async function main() {
  const [slug, title] = process.argv.slice(2);

  if (!slug) {
    throw new Error(
      '슬러그가 필요합니다.\n  npm run new-post -- my-slug\n  npm run new-post -- my-slug "글 제목"',
    );
  }

  if (!SLUG_PATTERN.test(slug)) {
    throw new Error(
      `슬러그 "${slug}"를 쓸 수 없습니다.\n영문 소문자·숫자·하이픈만 됩니다. 하이픈으로 시작하거나 끝날 수 없습니다.`,
    );
  }

  const filePath = path.join(POSTS_DIR, `${slug}.md`);

  // 덮어쓰지 않는다. 쓰던 글을 날리는 것보다 에러가 낫다.
  try {
    await fs.access(filePath);
    throw new Error(`content/posts/${slug}.md가 이미 있습니다.`);
  } catch (error) {
    const isMissing = (error as NodeJS.ErrnoException).code === "ENOENT";
    if (!isMissing) throw error;
  }

  await fs.mkdir(POSTS_DIR, { recursive: true });
  await fs.writeFile(filePath, template(slug, title ?? slug), { flag: "wx" });

  console.log(`content/posts/${slug}.md 생성

  1. npm run dev        미리보면서 씁니다 (draft여도 /posts/${slug}로 열립니다)
  2. description 채우기  스키마가 비어 있으면 빌드를 세웁니다
  3. draft: false        목록에 올립니다
  4. npm run verify`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
