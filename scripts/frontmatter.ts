/**
 * 콘텐츠 에이전트 — 본문에서 frontmatter의 파생 필드를 생성한다.
 *
 * 글쓴이는 본문과 title/date만 쓴다. description/categories/tags는 여기서 채운다.
 *
 * 이 스크립트가 하는 일 중 LLM 호출은 일부일 뿐이다.
 *
 *   대상 탐색 → 어휘 수집 → 프롬프트 조립 → [LLM] → 스키마 검증 → 병합 → 파일 쓰기
 *                                          ↑ 여기만 provider에 묶인다
 *
 * 그래서 LLM 앞뒤를 잘라 세 모드로 나눴다. 무엇이 필드를 채우든 —
 * 사람이든, Codex 같은 대화형 에이전트든, API든 — 통과해야 할 관문은 같다.
 *
 *   --plan    프롬프트와 JSON Schema를 .frontmatter/request.md로 뽑는다.  API 불필요
 *   --apply   .frontmatter/response.json을 검증·병합·저장한다.            API 불필요
 *   (기본)    위 둘을 Anthropic API 호출로 한 번에 처리한다.              API 필요
 *
 * 옵션: --all (이미 채워진 값도 다시 생성), --dry-run (파일을 쓰지 않음)
 *
 * 어느 경로로 들어오든 모델 출력은 generatedFrontmatterSchema를 통과해야 하고,
 * 병합 결과는 사람이 손으로 쓴 글과 똑같이 frontmatterSchema를 통과해야 한다.
 * 통과하지 못하면 파일을 쓰지 않는다.
 */

import fs from "node:fs/promises";
import path from "node:path";

import matter from "gray-matter";
import { z } from "zod";

import {
  frontmatterSchema,
  generatedFrontmatterSchema,
  type GeneratedFrontmatter,
} from "../lib/schema";

const POSTS_DIR = path.join(process.cwd(), "content", "posts");
const WORK_DIR = path.join(process.cwd(), ".frontmatter");
const REQUEST_PATH = path.join(WORK_DIR, "request.md");
const RESPONSE_PATH = path.join(WORK_DIR, "response.json");

const MODEL = "claude-opus-5";

/** 생성 대상 필드. 이 중 하나라도 비어 있으면 그 글은 처리 대상이다. */
const GENERATED_KEYS = ["description", "categories", "tags"] as const;

/** frontmatter 키 순서. 파일마다 순서가 달라지면 diff가 지저분해진다. */
const KEY_ORDER = ["title", "description", "date", "categories", "tags", "author", "draft"];

/** 응답 파일은 slug를 키로 하는 맵이다. 값은 모델이 채워야 할 필드. */
const responseSchema = z.record(z.string(), generatedFrontmatterSchema);

const INSTRUCTIONS = `당신은 한국어 기술 블로그의 편집자다. 마크다운 본문을 읽고 frontmatter의 분류 필드를 작성한다.

규칙:
- description은 한국어로, 글을 읽지 않은 사람이 무엇에 대한 글인지 알 수 있게 쓴다. 본문에 없는 내용을 지어내지 않는다.
- categories와 tags는 이미 이 블로그에서 쓰이는 값이 주어진다. 의미가 겹치면 반드시 기존 값을 재사용한다. 같은 개념에 대해 새 표기를 만들지 않는다.
- tags는 영문 소문자와 하이픈만 쓴다.
- 본문이 다루지 않는 주제를 태그로 달지 않는다.`;

type Mode = "plan" | "apply" | "generate";

type PostFile = {
  slug: string;
  filePath: string;
  data: Record<string, unknown>;
  body: string;
};

type Vocabulary = { categories: string[]; tags: string[] };

// ---------------------------------------------------------------------------
// provider와 무관한 부분 — 세 모드가 전부 공유한다
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): { mode: Mode; all: boolean; dryRun: boolean } {
  const flags = new Set(argv.slice(2));
  const known = new Set(["--plan", "--apply", "--all", "--dry-run"]);
  for (const flag of flags) {
    if (!known.has(flag)) {
      throw new Error(`알 수 없는 옵션: ${flag}\n사용 가능: --plan, --apply, --all, --dry-run`);
    }
  }
  if (flags.has("--plan") && flags.has("--apply")) {
    throw new Error("--plan과 --apply는 함께 쓸 수 없습니다. 순서대로 실행하세요.");
  }

  const mode: Mode = flags.has("--plan") ? "plan" : flags.has("--apply") ? "apply" : "generate";
  return { mode, all: flags.has("--all"), dryRun: flags.has("--dry-run") };
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

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/**
 * 이미 쓰이고 있는 분류 어휘를 모은다.
 *
 * 이걸 넘기지 않으면 글마다 nextjs / next.js / NextJS가 따로 생긴다.
 * 태그는 재사용될 때만 의미가 있으므로, 기존 어휘를 보여주고 재사용을 요구한다.
 */
function collectVocabulary(posts: PostFile[]): Vocabulary {
  const categories = new Set<string>();
  const tags = new Set<string>();
  for (const post of posts) {
    for (const value of toStringArray(post.data.categories)) categories.add(value);
    for (const value of toStringArray(post.data.tags)) tags.add(value);
  }
  return { categories: [...categories].sort(), tags: [...tags].sort() };
}

function describeVocabulary(vocabulary: Vocabulary): string {
  return [
    vocabulary.categories.length > 0
      ? `이 블로그에서 쓰이는 카테고리: ${vocabulary.categories.join(", ")}`
      : "이 블로그에는 아직 카테고리가 없다. 새로 만들어도 된다.",
    vocabulary.tags.length > 0
      ? `이 블로그에서 쓰이는 태그: ${vocabulary.tags.join(", ")}`
      : "이 블로그에는 아직 태그가 없다. 새로 만들어도 된다.",
  ].join("\n");
}

function titleOf(post: PostFile): string {
  return typeof post.data.title === "string" ? post.data.title : post.slug;
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

/**
 * 생성된 값을 원본에 병합하고 저장한다. 세 모드가 모두 이 함수를 지난다.
 *
 * 여기가 관문이다. 사람이 쓴 글과 같은 스키마를 통과하지 못하면 파일을 쓰지 않는다.
 */
async function applyGenerated(
  post: PostFile,
  generated: GeneratedFrontmatter,
  options: { all: boolean; dryRun: boolean },
): Promise<void> {
  const merged: Record<string, unknown> = { ...post.data };
  for (const key of GENERATED_KEYS) {
    // --all이 아니면 사람이 이미 써 둔 값은 건드리지 않는다.
    if (options.all || isMissing(merged[key])) merged[key] = generated[key];
  }

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

  if (!options.dryRun) {
    await fs.writeFile(post.filePath, matter.stringify(post.body, withStableKeyOrder(merged)));
  }
}

// ---------------------------------------------------------------------------
// --plan : 프롬프트를 파일로 뽑는다. API를 부르지 않는다.
// ---------------------------------------------------------------------------

async function runPlan(targets: PostFile[], vocabulary: Vocabulary): Promise<void> {
  const jsonSchema = z.toJSONSchema(generatedFrontmatterSchema);

  const document = `# frontmatter 생성 요청

이 파일은 \`npm run frontmatter -- --plan\`이 생성했습니다. 직접 편집하지 마세요.

## 지시

${INSTRUCTIONS}

## 분류 어휘

${describeVocabulary(vocabulary)}

## 출력 형식

아래 경로에 JSON 파일을 쓰세요. 다른 것은 쓰지 마세요.

    ${path.relative(process.cwd(), RESPONSE_PATH)}

slug를 키로 하고, 값은 아래 JSON Schema를 만족하는 객체입니다.
이 문서에 포함된 slug **전부**에 대해 항목을 만드세요.

\`\`\`json
${JSON.stringify(jsonSchema, null, 2)}
\`\`\`

예시:

\`\`\`json
{
${targets.map((post) => `  "${post.slug}": { "description": "...", "categories": ["..."], "tags": ["...", "..."] }`).join(",\n")}
}
\`\`\`

작성한 뒤 \`npm run frontmatter -- --apply\`를 실행하면 검증하고 저장합니다.
스키마를 어기면 저장되지 않고 어디가 틀렸는지 출력됩니다.

---

${targets
  .map(
    (post) => `## slug: ${post.slug}

제목: ${titleOf(post)}

본문:

${post.body.trim()}`,
  )
  .join("\n\n---\n\n")}
`;

  await fs.mkdir(WORK_DIR, { recursive: true });
  await fs.writeFile(REQUEST_PATH, document);

  const relative = path.relative(process.cwd(), REQUEST_PATH);
  console.log(`\n${relative} 작성 완료 (대상 ${targets.length}개)`);
  console.log("\n다음 단계:");
  console.log(`  1. 에이전트나 사람에게 ${relative}를 읽고 응답 파일을 쓰게 합니다`);
  console.log("  2. npm run frontmatter -- --apply");
}

// ---------------------------------------------------------------------------
// --apply : 응답 파일을 검증·병합·저장한다. API를 부르지 않는다.
// ---------------------------------------------------------------------------

async function runApply(
  targets: PostFile[],
  options: { all: boolean; dryRun: boolean },
): Promise<void> {
  const relative = path.relative(process.cwd(), RESPONSE_PATH);

  let raw: string;
  try {
    raw = await fs.readFile(RESPONSE_PATH, "utf8");
  } catch {
    throw new Error(`${relative}이 없습니다. 먼저 --plan으로 요청 파일을 만드세요.`);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${relative}이 올바른 JSON이 아닙니다 — ${(error as Error).message}`);
  }

  // 첫 번째 관문. 모델이 무엇을 썼든 여기서 형태가 강제된다.
  const parsed = responseSchema.safeParse(parsedJson);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`${relative}이 스키마와 맞지 않습니다:\n${detail}`);
  }

  const bySlug = new Map(targets.map((post) => [post.slug, post]));
  const unknownSlugs = Object.keys(parsed.data).filter((slug) => !bySlug.has(slug));
  if (unknownSlugs.length > 0) {
    console.warn(`경고: 대상에 없는 slug는 무시합니다 — ${unknownSlugs.join(", ")}`);
  }

  const missing = targets.filter((post) => !(post.slug in parsed.data)).map((p) => p.slug);
  if (missing.length > 0) {
    console.warn(`경고: 응답에 빠진 글은 건너뜁니다 — ${missing.join(", ")}`);
  }

  const failures: string[] = [];
  for (const post of targets) {
    const generated = parsed.data[post.slug];
    if (!generated) continue;
    try {
      await applyGenerated(post, generated, options);
    } catch (error) {
      console.error(`\n  ${post.slug} 실패: ${(error as Error).message}`);
      failures.push(post.slug);
    }
  }

  if (failures.length > 0) {
    throw new Error(`\n${failures.length}개 실패: ${failures.join(", ")}`);
  }
}

// ---------------------------------------------------------------------------
// 기본 : Anthropic API로 한 번에 처리한다.
// ---------------------------------------------------------------------------

/**
 * 인증 실패는 글마다 재시도할 일이 아니다. 자격증명이 없으면 첫 글에서 바로 멈춘다.
 * SDK는 키가 아예 없을 때 AuthenticationError가 아니라 일반 Error를 던지므로 둘 다 본다.
 */
function isAuthFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === "AuthenticationError" ||
    error.message.includes("Could not resolve authentication method")
  );
}

async function runGenerate(
  targets: PostFile[],
  vocabulary: Vocabulary,
  options: { all: boolean; dryRun: boolean },
): Promise<void> {
  // SDK는 이 경로에서만 필요하다. --plan / --apply는 SDK 없이도 돈다.
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const { zodOutputFormat } = await import("@anthropic-ai/sdk/helpers/zod");

  const client = new Anthropic();
  const failures: string[] = [];

  for (const post of targets) {
    try {
      const response = await client.messages.parse({
        model: MODEL,
        max_tokens: 16000,
        system: INSTRUCTIONS,
        // 본문에서 분류를 뽑는 단순한 작업이라 effort는 낮게 둔다.
        output_config: {
          effort: "low",
          format: zodOutputFormat(generatedFrontmatterSchema),
        },
        messages: [
          {
            role: "user",
            content: `${describeVocabulary(vocabulary)}\n\n---\n\n제목: ${titleOf(post)}\n\n본문:\n\n${post.body}`,
          },
        ],
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

      await applyGenerated(post, response.parsed_output, options);
    } catch (error) {
      if (isAuthFailure(error)) throw error;
      console.error(`\n  ${post.slug} 실패: ${(error as Error).message}`);
      failures.push(post.slug);
    }
  }

  if (failures.length > 0) {
    throw new Error(`\n${failures.length}개 실패: ${failures.join(", ")}`);
  }
}

// ---------------------------------------------------------------------------

async function main() {
  const { mode, all, dryRun } = parseArgs(process.argv);

  const posts = await readPosts();
  const vocabulary = collectVocabulary(posts);
  const targets = all ? posts : posts.filter(needsGeneration);

  if (targets.length === 0) {
    console.log("채울 필드가 없습니다. (전체를 다시 생성하려면 --all)");
    return;
  }

  console.log(`모드: ${mode} / 대상 ${targets.length}개 / 전체 ${posts.length}개${dryRun ? " (dry-run)" : ""}`);

  if (mode === "plan") {
    await runPlan(targets, vocabulary);
    return;
  }

  if (mode === "apply") {
    await runApply(targets, { all, dryRun });
  } else {
    await runGenerate(targets, vocabulary, { all, dryRun });
  }

  console.log(dryRun ? "\n완료 (파일은 쓰지 않았습니다)" : "\n완료");
}

main().catch((error: unknown) => {
  // 인증은 SDK가 알아서 찾는다 — ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN,
  // 또는 `ant auth login`으로 만든 프로필. 환경변수만 확인하면 프로필을 쓰는
  // 로컬 환경을 잘못 막게 되므로, 실제로 실패했을 때만 안내한다.
  if (isAuthFailure(error)) {
    console.error(
      "인증에 실패했습니다. API 키 없이 진행하려면 --plan / --apply 경로를 쓰세요.\n" +
        "  npm run frontmatter -- --plan   프롬프트를 파일로 뽑습니다\n" +
        "  npm run frontmatter -- --apply  작성된 응답을 검증·저장합니다",
    );
    process.exitCode = 1;
    return;
  }

  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
