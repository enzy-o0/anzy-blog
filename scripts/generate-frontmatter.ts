/**
 * 콘텐츠 에이전트 — 본문에서 frontmatter의 파생 필드를 생성한다.
 *
 * 글쓴이는 본문과 title/date만 쓰면 된다. description, categories, tags는
 * 이 스크립트가 채우고, 결과는 사람이 diff로 검토한 뒤 머지한다.
 * GitHub Actions에서 돌 때는 PR로 올라간다.
 *
 *   npm run frontmatter              비어 있는 필드만 채운다
 *   npm run frontmatter -- --all     이미 있는 값도 다시 생성한다
 *   npm run frontmatter -- --dry-run 파일을 쓰지 않고 결과만 출력한다
 *
 * 핵심은 모델 출력을 신뢰하지 않는다는 점이다. 응답은 lib/schema.ts의
 * generatedFrontmatterSchema로 형태가 강제되고, 병합 결과는 사람이 쓴 글과
 * 똑같이 frontmatterSchema를 통과해야 한다. 통과하지 못하면 파일을 쓰지 않는다.
 */

import fs from "node:fs/promises";
import path from "node:path";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import matter from "gray-matter";

import {
  frontmatterSchema,
  generatedFrontmatterSchema,
  type GeneratedFrontmatter,
} from "../lib/schema";

const POSTS_DIR = path.join(process.cwd(), "content", "posts");
const MODEL = "claude-opus-5";

/** 생성 대상 필드. 이 중 하나라도 비어 있으면 그 글은 처리 대상이다. */
const GENERATED_KEYS = ["description", "categories", "tags"] as const;

/** frontmatter 키 순서. 파일마다 순서가 달라지면 diff가 지저분해진다. */
const KEY_ORDER = ["title", "description", "date", "categories", "tags", "author", "draft"];

const SYSTEM_PROMPT = `당신은 한국어 기술 블로그의 편집자다. 마크다운 본문을 읽고 frontmatter의 분류 필드를 작성한다.

규칙:
- description은 한국어로, 글을 읽지 않은 사람이 무엇에 대한 글인지 알 수 있게 쓴다. 본문에 없는 내용을 지어내지 않는다.
- categories와 tags는 이미 이 블로그에서 쓰이는 값이 주어진다. 의미가 겹치면 반드시 기존 값을 재사용한다. 같은 개념에 대해 새 표기를 만들지 않는다.
- tags는 영문 소문자와 하이픈만 쓴다.
- 본문이 다루지 않는 주제를 태그로 달지 않는다.`;

/**
 * 인증 실패는 글마다 재시도할 일이 아니다. 자격증명이 없으면 첫 글에서 바로 멈춘다.
 * SDK는 키가 아예 없을 때 AuthenticationError가 아니라 일반 Error를 던지므로 둘 다 본다.
 */
function isAuthFailure(error: unknown): boolean {
  if (error instanceof Anthropic.AuthenticationError) return true;
  return error instanceof Error && error.message.includes("Could not resolve authentication method");
}

type PostFile = {
  slug: string;
  filePath: string;
  data: Record<string, unknown>;
  body: string;
};

function parseArgs(argv: string[]) {
  const flags = new Set(argv.slice(2));
  const known = new Set(["--all", "--dry-run"]);
  for (const flag of flags) {
    if (!known.has(flag)) {
      throw new Error(`알 수 없는 옵션: ${flag} (사용 가능: --all, --dry-run)`);
    }
  }
  return { all: flags.has("--all"), dryRun: flags.has("--dry-run") };
}

async function readPosts(): Promise<PostFile[]> {
  const entries = await fs.readdir(POSTS_DIR);
  const slugs = entries.filter((n) => n.endsWith(".md")).map((n) => n.replace(/\.md$/, ""));

  return Promise.all(
    slugs.map(async (slug) => {
      const filePath = path.join(POSTS_DIR, `${slug}.md`);
      const { data, content } = matter(await fs.readFile(filePath, "utf8"));
      return { slug, filePath, data, body: content };
    }),
  );
}

function isMissing(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function needsGeneration(post: PostFile): boolean {
  return GENERATED_KEYS.some((key) => isMissing(post.data[key]));
}

/**
 * 이미 쓰이고 있는 분류 어휘를 모은다.
 *
 * 이걸 넘기지 않으면 모델이 글마다 nextjs / next.js / NextJS를 따로 만들어낸다.
 * 태그는 재사용될 때만 의미가 있으므로, 기존 어휘를 보여주고 재사용을 요구한다.
 */
function collectVocabulary(posts: PostFile[]): { categories: string[]; tags: string[] } {
  const categories = new Set<string>();
  const tags = new Set<string>();

  for (const post of posts) {
    for (const value of toStringArray(post.data.categories)) categories.add(value);
    for (const value of toStringArray(post.data.tags)) tags.add(value);
  }

  return {
    categories: [...categories].sort(),
    tags: [...tags].sort(),
  };
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function buildPrompt(post: PostFile, vocabulary: { categories: string[]; tags: string[] }): string {
  const known = [
    vocabulary.categories.length > 0
      ? `이 블로그에서 쓰이는 카테고리: ${vocabulary.categories.join(", ")}`
      : "이 블로그에는 아직 카테고리가 없다. 새로 만들어도 된다.",
    vocabulary.tags.length > 0
      ? `이 블로그에서 쓰이는 태그: ${vocabulary.tags.join(", ")}`
      : "이 블로그에는 아직 태그가 없다. 새로 만들어도 된다.",
  ].join("\n");

  const title = typeof post.data.title === "string" ? post.data.title : post.slug;

  return `${known}\n\n---\n\n제목: ${title}\n\n본문:\n\n${post.body}`;
}

async function generate(
  client: Anthropic,
  post: PostFile,
  vocabulary: { categories: string[]; tags: string[] },
): Promise<GeneratedFrontmatter> {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    // 본문에서 분류를 뽑는 단순한 작업이라 effort는 낮게 둔다.
    output_config: {
      effort: "low",
      format: zodOutputFormat(generatedFrontmatterSchema),
    },
    messages: [{ role: "user", content: buildPrompt(post, vocabulary) }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error(`모델이 응답을 거절했습니다 (${response.stop_details?.category ?? "이유 미상"})`);
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("응답이 max_tokens에서 잘렸습니다. 본문이 너무 길 수 있습니다.");
  }
  if (response.parsed_output === null) {
    throw new Error("응답을 스키마로 파싱하지 못했습니다.");
  }

  return response.parsed_output;
}

/** 키 순서를 고정한다. 알려지지 않은 키는 뒤에 원래 순서대로 붙인다. */
function withStableKeyOrder(data: Record<string, unknown>): Record<string, unknown> {
  const ordered: Record<string, unknown> = {};
  for (const key of KEY_ORDER) {
    if (key in data) ordered[key] = data[key];
  }
  for (const key of Object.keys(data)) {
    if (!(key in ordered)) ordered[key] = data[key];
  }
  return ordered;
}

async function main() {
  const { all, dryRun } = parseArgs(process.argv);

  const posts = await readPosts();
  const vocabulary = collectVocabulary(posts);
  const targets = all ? posts : posts.filter(needsGeneration);

  if (targets.length === 0) {
    console.log("채울 필드가 없습니다. (전체를 다시 생성하려면 --all)");
    return;
  }

  console.log(`대상 ${targets.length}개 / 전체 ${posts.length}개${dryRun ? " (dry-run)" : ""}`);

  const client = new Anthropic();
  const failures: string[] = [];

  for (const post of targets) {
    try {
      const generated = await generate(client, post, vocabulary);

      // --all이 아니면 사람이 이미 써 둔 값은 건드리지 않는다.
      const merged: Record<string, unknown> = { ...post.data };
      for (const key of GENERATED_KEYS) {
        if (all || isMissing(merged[key])) merged[key] = generated[key];
      }

      // 사람이 쓴 글과 같은 관문. 여기서 걸리면 파일을 쓰지 않는다.
      const check = frontmatterSchema.safeParse(merged);
      if (!check.success) {
        const detail = check.error.issues
          .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
          .join(", ");
        throw new Error(`병합 결과가 frontmatterSchema를 통과하지 못했습니다 — ${detail}`);
      }

      console.log(`\n  ${post.slug}`);
      console.log(`    description: ${generated.description}`);
      console.log(`    categories:  ${generated.categories.join(", ")}`);
      console.log(`    tags:        ${generated.tags.join(", ")}`);

      if (!dryRun) {
        await fs.writeFile(post.filePath, matter.stringify(post.body, withStableKeyOrder(merged)));
      }
    } catch (error) {
      if (isAuthFailure(error)) throw error;

      const message = error instanceof Error ? error.message : String(error);
      console.error(`\n  ${post.slug} 실패: ${message}`);
      failures.push(post.slug);
    }
  }

  if (failures.length > 0) {
    // 일부만 실패해도 나머지는 그대로 둔다. 성공한 파일은 이미 쓰였다.
    throw new Error(`\n${failures.length}개 실패: ${failures.join(", ")}`);
  }

  console.log(dryRun ? "\n완료 (파일은 쓰지 않았습니다)" : "\n완료");
}

main().catch((error: unknown) => {
  // 인증은 SDK가 알아서 찾는다 — ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN,
  // 또는 `ant auth login`으로 만든 프로필. 환경변수만 확인하면 프로필을 쓰는
  // 로컬 환경을 잘못 막게 되므로, 실제로 실패했을 때만 안내한다.
  if (isAuthFailure(error)) {
    console.error(
      "인증에 실패했습니다. ANTHROPIC_API_KEY를 export하거나 `ant auth login`으로 로그인하세요.\n" +
        "CI에서는 레포 시크릿 ANTHROPIC_API_KEY가 필요합니다.",
    );
    process.exitCode = 1;
    return;
  }

  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
