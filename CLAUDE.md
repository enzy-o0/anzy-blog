# Anzy 블로그

`content/posts/*.md`를 빌드타임에 정적 페이지로 굽는 개인 블로그.
원티드 프리온보딩 챌린지 FE 3-2 과제를 포트폴리오용으로 재구축한 것이다.
과제 원본은 `main` 브랜치에 보존되어 있고, 개편 내역은 `README.md` 아래쪽에 있다.

Next.js 16 (App Router) / React 19 / Tailwind 4 / unified / zod / TypeScript 5.9

## 명령어

```bash
npm run dev        # 개발 서버
npm run verify     # typecheck + lint + build. 커밋 전에 이걸 돌린다
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm run build      # 정적 빌드
```

## 구조

```
app/                    라우팅과 화면 (서버 컴포넌트)
lib/schema.ts           frontmatter zod 스키마
lib/posts.ts            파일시스템 포스트 로더
lib/markdown.ts         마크다운 → HTML 파이프라인
content/posts/*.md      포스트 본문
```

## 이 저장소의 규칙

**글 추가는 파일 하나로 끝난다.** `content/posts/`에 `.md`를 놓으면 목록과 라우트가 따라온다.
`generateStaticParams`나 목록 JSX에 slug를 적는 코드를 다시 만들지 않는다 — 과제 원본이 정확히 그래서 글 하나 추가에 세 곳을 고쳐야 했다.

**frontmatter의 진실은 `lib/schema.ts` 하나다.** 필드를 추가하거나 바꿀 때 그 파일만 고친다.
타입은 `z.infer`로 파생되므로 따로 선언하지 않는다. 검증을 우회하거나 실패를 삼키지 않는다 — 빌드를 세우는 편이 낫다.

**코드펜스에는 언어를 명시한다.** `rehype-highlight`의 자동 감지(`detect`)는 꺼져 있다.
켜 봤더니 언어 없는 펜스를 CSS로 오인해 엉뚱하게 칠했다. 추측보다 선언이 낫다.

**`any`를 쓰지 않는다.** 특히 외부에서 읽은 데이터가 처음 들어오는 경계에서.
과제 원본의 `postData: any`가 정확히 그 자리에 있었다.

**파일시스템을 읽는 코드는 `lib/`에 두고 서버 컴포넌트에서만 부른다.**
`pages/api`에 라이브러리를 두는 바람에 `resolve.fallback = { fs: false }` 웹팩 우회가 필요했던 전례가 있다. 클라이언트 컴포넌트(`"use client"`)에서 `lib/posts.ts`를 import하지 않는다.

## 커밋

한 커밋에 한 관심사. 제목은 `type: 한글 요약` (`feat` / `fix` / `refactor` / `chore` / `docs`).

본문에는 **무엇을 바꿨는지보다 원래 뭐가 문제였는지**를 적는다.
이 저장소의 커밋 로그는 개발일지의 재료로 쓰인다. diff를 읽으면 알 수 있는 내용은 생략하고, diff에 안 남는 이유를 남긴다.

## 앞으로

`lib/schema.ts`는 이후 콘텐츠 에이전트가 생성한 frontmatter의 검증 관문으로 재사용된다.
사람이 쓰든 모델이 쓰든 같은 스키마를 통과해야 한다는 것이 설계의 핵심이라, 스키마를 느슨하게 만들지 않는다.
