# Anzy 블로그

`content/posts/*.md`를 읽어 빌드타임에 정적 페이지로 굽는 개인 블로그.

원티드 프리온보딩 챌린지 FE 3-2 과제로 시작해서, 포트폴리오용으로 다시 지었다.
과제 원본은 `main` 브랜치에 그대로 남아 있고, 이 문서 아래쪽에 **무엇이 문제였고 어떻게 바꿨는지**를 기록해 두었다.

## 스택

| | |
|---|---|
| 프레임워크 | Next.js 16 (App Router) |
| 런타임 | React 19 |
| 스타일 | Tailwind CSS 4 + `@tailwindcss/typography` |
| 마크다운 | unified (remark → rehype) + rehype-highlight |
| 검증 | zod |
| 언어 | TypeScript 5.9 (`strict`, `noUncheckedIndexedAccess`) |

## 실행

Node 22 LTS 또는 24 이상을 권장한다. (Node 23은 비-LTS 라인이라 일부 의존성이 engine 경고를 낸다.)

```bash
npm install
npm run dev        # 개발 서버
npm run build      # 정적 빌드
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
```

## 구조

```
app/
  layout.tsx              공통 셸 (헤더, 전역 스타일)
  page.tsx                포스트 목록
  posts/[slug]/page.tsx   포스트 상세
  globals.css             Tailwind 진입점 + 코드블록 스타일 조정
lib/
  schema.ts               frontmatter zod 스키마 (단일 진실 공급원)
  posts.ts                파일시스템 기반 포스트 로더
  markdown.ts             마크다운 → HTML 파이프라인
content/posts/*.md        포스트 본문
```

글을 추가하려면 `content/posts/`에 `.md` 파일을 하나 놓으면 된다. 코드는 건드리지 않는다.

### frontmatter

`lib/schema.ts`가 요구하는 형태다. `slug`는 파일 이름에서 나오므로 적지 않는다.

```yaml
---
title: 글 제목            # 필수
description: 한 줄 요약    # 필수
date: "2026-08-11"        # 필수, YYYY-MM-DD
categories: [NextJS]      # 선택, 기본 []
tags: [nextjs, react]     # 선택, 기본 []
author: Anzy              # 선택, 기본 "Anzy"
draft: false              # 선택, true면 목록에서 제외
---
```

스키마를 어기면 **빌드가 실패한다.** 어느 파일의 어느 필드가 왜 틀렸는지 함께 출력된다.

```
Error: content/posts/__schema-test.md의 frontmatter가 스키마와 맞지 않습니다:
  - description: Invalid input: expected string, received undefined
  - date: YYYY-MM-DD 형식이어야 합니다
```

조용히 통과시키면 목록에서 제목이 빈 칸으로 나갈 뿐이라, 세우는 쪽을 택했다.

---

# 과제 원본에서 무엇을 바꿨나

`main`의 과제 제출본을 읽고 정리한 기술부채와 그 처리 내역이다.

## 요약

| 영역 | 과제 원본 (`main`) | 현재 |
|---|---|---|
| 라우팅 | Pages Router (`pages/[id]/index.tsx`) | App Router (`app/posts/[slug]/page.tsx`) |
| 포스트 목록 | `getStaticPaths`에 slug 2개 하드코딩 | 파일시스템을 읽어 `generateStaticParams` 생성 |
| 홈 화면 | 카드 두 개를 통째로 복붙한 JSX | `getAllPosts()` 결과를 순회 |
| 타입 | `postData: any`, `params: any`, `ctx: any` | 스키마에서 파생된 타입, `any` 없음 |
| frontmatter | 검증 없음 | zod 런타임 검증 + 빌드 실패 |
| 마크다운 | `remark-html` 결과에 문자열 치환 | unified AST 파이프라인 |
| 하이라이팅 | 클라이언트에서 `initHighlightingOnLoad()` | 빌드타임 처리 (런타임 JS 0) |
| 포스트 로더 위치 | `pages/api/md.ts` | `lib/posts.ts` |
| 웹팩 설정 | `resolve.fallback = { fs: false }` | 불필요해져 제거 |
| UI 라이브러리 | NextUI `1.0.0-beta.10` (유지보수 중단) | Tailwind 4 + typography |
| 의존성 | 16개 (미사용 6개 + `fs`/`path`) | 12개, 전부 사용 중 |
| 락파일 | `yarn.lock`과 `package-lock.json` 공존 | `package-lock.json` 하나 |

## 항목별

### 1. 글을 추가하려면 코드를 고쳐야 했다

```ts
// 원본 pages/[id]/index.tsx
export async function getStaticPaths() {
  return {
    paths: [{ params: { id: "grid" } }, { params: { id: "text" } }],
    fallback: false,
  };
}
```

목록의 진실이 두 군데(파일시스템과 이 배열)에 있었고, 둘은 자동으로 동기화되지 않는다.
홈 화면도 마찬가지로 카드 JSX가 복붙되어 있어서, 글 하나를 올리려면 **세 곳**을 고쳐야 했다.

지금은 `lib/posts.ts`의 `getPostSlugs()`가 `content/posts/`를 읽고, 목록 페이지와 `generateStaticParams`가 모두 거기서 나온다. `dynamicParams = false`라서 목록에 없는 slug는 404다.

### 2. `any`로 덮어둔 경계

커밋 메시지에 `type 정의 (임시로 any)`가 남아 있다. 문제는 `any`가 놓인 위치였다 —
`postData`는 **외부 파일에서 읽은 신뢰할 수 없는 데이터**가 처음 들어오는 지점이다. 타입이 가장 필요한 곳에 타입이 없었다.

`lib/schema.ts`에 zod 스키마를 두고 타입을 거기서 파생시켰다. 컴파일타임 타입과 런타임 검증이 같은 정의에서 나오므로 서로 어긋날 수 없다.

```ts
export const frontmatterSchema = z.object({ /* ... */ });
export type Frontmatter = z.infer<typeof frontmatterSchema>;
```

YAML이 따옴표 없는 `date: 2022-10-13`을 `Date` 객체로 자동 변환하는 함정이 있어, 날짜는 문자열로 정규화한 뒤 검증한다.

### 3. 문자열 치환으로 흉내낸 하이라이팅

```ts
// 원본 pages/api/md.ts
const contentHtml = processedContent
  .toString()
  .replaceAll("<pre>", "<pre class='hljs'>");
```

코드블록의 언어를 알 수 없고, 본문에 `<pre>`가 등장하면 같이 오염된다.
게다가 실제 색칠은 클라이언트에서 `hljs.initHighlightingOnLoad()`(deprecated)로 했다 — 하이라이팅 하나 때문에 highlight.js 전체가 브라우저로 내려갔다.

지금은 AST 단계에서 `rehype-highlight`가 처리하고, 결과 HTML은 빌드 시점에 확정된다. 런타임에 내려가는 하이라이팅 JS는 없다.

자동 언어 감지(`detect`)는 켜지 않았다. 실제로 켜 봤더니 언어 표시가 없는 코드펜스를 CSS로 오인해 엉뚱하게 칠했다. 추측 대신 마크다운에서 언어를 명시하도록 했다.

### 4. `pages/api`에 있던 lib 파일

`pages/api/md.ts`는 default export 핸들러가 없는데 API 라우트 디렉토리에 있었다. 실제로는 그냥 라이브러리다.

이것 때문에 `next.config.js`에 `resolve.fallback = { fs: false }` 우회가 필요했다 — 서버 전용 코드가 클라이언트 번들에 딸려 들어갈 위험을 웹팩 설정으로 막고 있었던 셈이다. `lib/posts.ts`로 옮기고 서버 컴포넌트에서만 호출하니 우회가 통째로 사라졌다.

### 5. 렌더링되지 않을 상태였던 홈 화면

```tsx
// 원본 pages/index.tsx
<Image src="https://avatars.githubusercontent.com/u/86160567?s=200&v=4"
       width="34px" height="34px" />
```

`next/image`로 외부 호스트 이미지를 쓰려면 `next.config.js`에 해당 도메인을 등록해야 하는데 설정이 없었고, `width`/`height`는 숫자를 받는 자리에 `"34px"` 문자열이 들어가 있었다. 둘 다 Next.js가 에러를 던지는 조건이다. (원본을 실행해 확인하지는 않았다 — 해당 화면 자체를 다시 만들었다.)

### 6. 의존성

- **`fs@0.0.1-security`** — 실제 패키지가 아니다. npm이 이름 스쿼팅을 막으려고 올려둔 빈 자리표시자다. Node 내장 `fs`를 쓰려고 설치한 것으로 보이는데, 오히려 내장 모듈을 가린다. `path@0.12.7`도 같은 경우.
- **미사용 6개** — `front-matter`, `markdown-it`, `prismjs`, `remark-parse`, `to-vfile`, `unified`가 코드에서 한 번도 import되지 않았다. 마크다운 라이브러리를 여러 개 시도한 흔적으로 보인다.
- **락파일 2개** — `yarn.lock`과 `package-lock.json`이 함께 커밋되어 있었다. 설치 도구에 따라 서로 다른 트리가 나온다. npm으로 일원화했다.
- **NextUI `1.0.0-beta.10`** — 유지보수가 끝났고 HeroUI로 이름이 바뀌었다. 블로그가 필요로 하는 UI는 헤더와 목록, 본문 타이포그래피가 전부라 컴포넌트 라이브러리 대신 Tailwind + `@tailwindcss/typography`로 갔다. 의존성 하나를 줄이고 본문 가독성을 직접 통제하는 쪽을 택했다.

## 검증한 것

- `npm run build` 통과, 두 포스트 모두 SSG로 프리렌더
- `npm run typecheck` 통과 (`any` 없음)
- `npm run lint` 통과
- 라우트 응답: `/` 200, `/posts/grid` 200, `/posts/text` 200, `/posts/nope` 404
- 프리렌더된 HTML에 `hljs-*` 토큰이 실제로 들어가는지 확인
- frontmatter 스키마 위반 시 빌드가 실패하는지 확인

---

## 앞으로

이 정리는 그 자체가 목적이 아니라, 콘텐츠 파이프라인을 얹기 위한 바닥 고르기였다.

- **빌드타임 콘텐츠 에이전트** — 본문만 쓰면 frontmatter(요약, 태그, 카테고리)를 생성해 PR로 올린다. `lib/schema.ts`가 그대로 모델 출력의 검증 관문이 된다. 사람이 쓰든 모델이 쓰든 같은 스키마를 통과해야 한다는 점이 핵심이다.
- **인용 기반 검색** — 포스트를 빌드타임에 임베딩해 두고, 질문에 대해 근거 문단을 함께 제시한다. 근거를 못 찾으면 답하지 않는다.
