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
