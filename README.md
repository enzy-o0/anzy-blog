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

---

# 콘텐츠 에이전트

글쓴이는 본문과 `title` / `date`만 쓴다. `description` / `categories` / `tags`는 에이전트가 본문을 읽고 채우고, 결과는 **PR로 올라가 사람이 diff를 보고 머지한다.** main에 자동 커밋하지 않는다 — 검토가 이 파이프라인의 절반이다.

## 세 가지 모드

이 스크립트가 하는 일 중 LLM 호출은 일부일 뿐이다.

```
대상 탐색 → 어휘 수집 → 프롬프트 조립 → [LLM] → 스키마 검증 → 병합 → 파일 쓰기
                                       ↑ 여기만 provider에 묶인다
```

그래서 LLM 앞뒤를 잘라 세 모드로 나눴다. **무엇이 필드를 채우든 — 사람이든, 대화형 코딩 에이전트든, API든 — 통과해야 할 관문은 같다.**

| 모드 | 하는 일 | API 키 |
|---|---|---|
| `--plan` | 프롬프트와 JSON Schema를 `.frontmatter/request.md`로 뽑는다 | **불필요** |
| `--apply` | `.frontmatter/response.json`을 검증·병합·저장한다 | **불필요** |
| (기본) | 위 둘을 Anthropic API 호출로 한 번에 처리한다 | 필요 |

옵션 `--all`(이미 채워진 값도 다시 생성), `--dry-run`(파일을 쓰지 않음)은 세 모드 모두와 조합된다.

### 키 없이 — 대화형 에이전트에게 맡기기

```bash
npm run frontmatter -- --plan          # .frontmatter/request.md 생성
# 에이전트에게: "request.md 읽고 response.json 써줘"
npm run frontmatter -- --apply         # 검증 후 저장
```

`request.md`에는 지시사항, 기존 분류 어휘, `z.toJSONSchema()`로 뽑은 JSON Schema, 그리고 대상 글의 본문이 들어간다. 응답이 스키마를 어기면 **어느 글의 어느 필드가 왜 틀렸는지 출력하고 아무것도 저장하지 않는다** — 일부만 반영되는 상태를 만들지 않는다.

### 키가 있을 때 — 한 번에

```bash
echo 'ANTHROPIC_API_KEY=sk-ant-...' > .env.local   # .gitignore에 포함되어 있다
npm run frontmatter:local -- --all --dry-run
npm run frontmatter:local -- --all
```

`frontmatter:local`은 `.env.local`에서 키를 읽는다. CI는 시크릿을 환경변수로 받으므로 `npm run frontmatter`를 쓴다.

**`--dry-run`은 "실행 안 함"이 아니라 "저장 안 함"이다.** 기본 모드에서는 API가 실제로 호출되고 비용도 나간다. 파일 쓰기만 건너뛴다.

`content/posts/**.md`가 푸시되면 `.github/workflows/frontmatter.yml`이 같은 작업을 하고 PR을 연다.

## 설계에서 신경 쓴 것

**스키마가 사람·에이전트·API 공통의 관문이다.** `lib/schema.ts`의 `generatedFrontmatterSchema`는 세 곳에서 쓰인다 — API 모드에서는 structured outputs로 넘겨 응답 형태를 강제하고, `--plan` 모드에서는 `z.toJSONSchema()`로 변환해 요청 문서에 싣고, 어느 경로로 들어왔든 돌아온 값을 검증한다. 그리고 병합 결과는 손으로 쓴 글과 **똑같이** `frontmatterSchema`를 통과해야 한다. 통과하지 못하면 파일을 쓰지 않고, CI에서는 PR도 열리지 않는다.

"LLM API를 호출했다"가 아니라 **"누가 썼든 같은 관문을 통과한다"가 이 설계의 주장이고, 세 모드가 그걸 코드로 증명한다.**

**모델이 건드릴 수 있는 필드를 좁혔다.**

| 사람이 소유 | 모델이 생성 |
|---|---|
| `title`, `date`, `author`, `draft` | `description`, `categories`, `tags` |

저자의 의도이거나 사실인 것은 사람이 쓴다. 본문에서 파생되는 분류 정보만 모델이 채운다. `--all`을 주지 않으면 사람이 이미 써 둔 값도 덮어쓰지 않는다.

**기존 분류 어휘를 프롬프트에 넣는다.** 이걸 넘기지 않으면 모델이 글마다 `nextjs` / `next.js` / `NextJS`를 따로 만들어낸다. 태그는 재사용될 때만 의미가 있어서, 현재 쓰이는 카테고리·태그 목록을 함께 주고 재사용을 요구한다.

**실패를 삼키지 않는다.** `stop_reason`이 `refusal`이거나 `max_tokens`면 그 글은 실패로 기록하고 파일을 쓰지 않는다. 인증 실패는 글마다 재시도할 일이 아니라서 첫 글에서 바로 중단한다. 일부만 실패하면 성공한 것은 남기고 종료 코드 1로 끝낸다.

**모델과 비용.** `claude-opus-5`, `effort: "low"`. 본문에서 분류를 뽑는 단순한 작업이라 깊은 추론이 필요 없다. 호출은 글이 추가·수정될 때만 일어나고, 런타임에는 아무것도 호출하지 않는다 — 블로그 자체는 여전히 정적 빌드다.

## CI

`content/posts/**.md`가 푸시되면 워크플로가 돈다. **레포 시크릿 `ANTHROPIC_API_KEY`가 없으면 조용히 건너뛴다** — 자동 생성은 선택 경로이고, 키 없이도 로컬 `--plan` / `--apply`로 같은 일을 할 수 있다.

키가 있을 때 PR을 열려면 Settings → Actions → General에서 **Allow GitHub Actions to create and approve pull requests**를 켜야 한다.

## 다음

- **인용 기반 검색** — 포스트를 빌드타임에 임베딩해 두고, 질문에 대해 근거 문단을 함께 제시한다. 근거를 못 찾으면 답하지 않는다.
