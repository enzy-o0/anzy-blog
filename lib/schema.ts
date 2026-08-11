import { z } from "zod";

/**
 * 포스트 frontmatter의 단일 진실 공급원.
 *
 * 여기서 정의한 스키마는 두 곳에서 재사용된다.
 *  1. 빌드타임 — 손으로 쓴 마크다운의 frontmatter 검증
 *  2. (이후) 콘텐츠 에이전트가 생성한 frontmatter 검증
 *
 * 즉 사람이 쓰든 모델이 쓰든 같은 관문을 통과해야 한다.
 */

/**
 * YAML은 따옴표 없는 `date: 2022-10-13`을 Date 객체로 자동 변환한다.
 * 작성자가 따옴표를 빠뜨려도 깨지지 않도록 문자열로 정규화한 뒤 검증한다.
 */
const isoDate = z.preprocess(
  (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : value),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식이어야 합니다"),
);

export const frontmatterSchema = z.object({
  title: z.string().min(1, "제목은 비어 있을 수 없습니다"),
  description: z.string().min(1, "설명은 비어 있을 수 없습니다"),
  date: isoDate,
  categories: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  author: z.string().default("Anzy"),
  draft: z.boolean().default(false),
});

export type Frontmatter = z.infer<typeof frontmatterSchema>;

/**
 * 콘텐츠 에이전트가 생성해도 되는 필드만 추린 부분집합.
 *
 * 경계는 의도적으로 그었다.
 *  - 사람이 쓴다: title, date, author, draft — 저자의 의도이거나 사실이다
 *  - 모델이 채운다: description, categories, tags — 본문에서 파생되는 분류 정보다
 *
 * 이 스키마는 두 가지로 동시에 쓰인다. Anthropic API의 structured outputs에
 * 넘겨 응답 형태를 강제하고, 돌아온 값을 다시 검증하는 관문이 된다.
 * 그리고 병합 결과는 위의 frontmatterSchema를 한 번 더 통과해야 한다.
 */
export const generatedFrontmatterSchema = z.object({
  description: z
    .string()
    .min(1)
    .max(120)
    .describe("글의 내용을 한 문장으로 요약한다. 마침표 없이 명사형으로 끝낸다."),
  categories: z
    .array(z.string())
    .min(1)
    .max(3)
    .describe("큰 분류. 기존 카테고리가 맞으면 새로 만들지 말고 그대로 쓴다."),
  tags: z
    .array(z.string())
    .min(2)
    .max(6)
    .describe("영문 소문자 키워드. 기존 태그와 의미가 겹치면 기존 것을 재사용한다."),
});

export type GeneratedFrontmatter = z.infer<typeof generatedFrontmatterSchema>;
