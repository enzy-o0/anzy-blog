---
title: '"임시로 any"가 가린 것'
description: 4년 전 과제 코드를 다시 읽고, any가 어디에 놓였는지 확인한 기록
date: "2026-08-12"
categories:
  - NextJS
tags:
  - nextjs
  - typescript
  - refactoring
author: Anzy
draft: false
---

4년 가까이 전에 낸 과제 코드를 포트폴리오로 쓰려고 다시 열었다. 마크다운을 읽어 정적 페이지로 굽는 작은 블로그다. 동작은 했다. 배포도 되어 있었다.

커밋 로그의 마지막 두 개가 이랬다.

```
e6e43d3 type 정의 (임시로 any)
7e3f9c0 type 정의 (임시로 any)
```

같은 메시지로 두 번.

다시 읽으면서 알게 된 건, **문제가 `any`를 썼다는 사실이 아니라 그게 어디에 놓였는지였다.**

## 타입이 있었는데 없었다

포스트를 읽는 함수는 이렇게 생겼다.

```ts
// pages/api/md.ts
export async function getPostData(id: number) {
  const fullPath = path.join("__posts", `${id}.md`);
  // ...
}
```

`id: number`. 타입을 적어놨다. 그런데 호출하는 쪽은 이랬다.

```tsx
// pages/[id]/index.tsx
export async function getStaticPaths() {
  return {
    paths: [{ params: { id: "grid" } }, { params: { id: "text" } }],
    fallback: false,
  };
}

export async function getStaticProps({ params }: any) {
  const postData = await getPostData(params.id);
  // ...
}
```

`getStaticPaths`가 넘기는 `id`는 `"grid"`, `"text"` — 문자열이다. 받는 쪽은 `number`라고 선언했다. **명백한 불일치인데 컴파일이 통과한다.**

`params`가 `any`이기 때문이다. `params.id`도 `any`가 되고, `any`는 `number` 자리에 아무 저항 없이 들어간다. 타입스크립트는 아무 말도 하지 않는다.

그리고 런타임에도 안 터진다. `` `${id}.md` ``는 문자열이든 숫자든 똑같이 동작하니까. `"grid.md"`가 만들어지고, 파일이 열리고, 페이지가 렌더링된다.

정리하면 이렇다.

- 타입을 하나 적었는데 그게 틀렸고
- 그 틀림을 잡아줄 유일한 지점에 `any`가 놓여 있었고
- 런타임에는 우연히 동작해서 아무도 몰랐다

`any`는 타입 검사를 **건너뛴** 게 아니다. 이미 있던 타입을 **무력화**했다.

## 하필 그 자리였다

`any`가 붙은 자리를 다시 본다.

```tsx
export default function Post({ postData }: any) {
```

`postData`는 `.md` 파일에서 읽어온 데이터다. frontmatter는 손으로 쓴 YAML이고, 오타가 나도 아무도 안 잡아준다. 파일이 프로그램 안으로 들어오는 첫 지점, 그러니까 **바깥에서 온 것을 처음 믿기 시작하는 경계**다.

타입이 가장 필요한 곳이 정확히 거기다. 그리고 거기에 `any`가 있었다.

내부 로직에 `any`를 쓰면 불편한 정도로 끝난다. 경계에 쓰면 그 뒤의 모든 코드가 근거 없는 가정 위에서 돌아간다. `postData.title`이 있다고 믿고, `postData.date`가 문자열이라고 믿는다. 아무도 확인하지 않았는데.

## 있지도 않은 패키지를 설치해뒀다

같은 눈으로 `package.json`을 보다가 이걸 발견했다.

```json
"fs": "0.0.1-security"
```

Node 내장 `fs`를 쓰려고 설치한 것 같은데, 이건 **실제 패키지가 아니다.** npm이 누가 `fs`라는 이름을 선점하지 못하게 올려둔 빈 자리표시자다. 코드는 아무것도 들어 있지 않다.

설치한다고 뭐가 되지도 않고, 오히려 내장 모듈을 가린다. 그런데도 4년 동안 아무 일이 없었다. Node가 내장 모듈을 먼저 찾기 때문이다.

`path`도 같은 이유로 들어가 있었다.

## 무엇을 바꿨나

전부 다시 지었다. Pages Router에서 App Router로, NextUI에서 Tailwind로. 하지만 핵심은 그게 아니었다.

`any`를 지우는 방법이 "타입을 하나 적는 것"이 아니라는 게 이번의 결론이다. 손으로 쓴 타입은 위의 `id: number`처럼 틀릴 수 있고, 틀려도 아무도 모른다.

그래서 스키마 하나를 진실로 삼고 타입을 거기서 파생시켰다.

```ts
export const frontmatterSchema = z.object({
  title: z.string().min(1, "제목은 비어 있을 수 없습니다"),
  description: z.string().min(1, "설명은 비어 있을 수 없습니다"),
  date: isoDate,
  // ...
});

export type Frontmatter = z.infer<typeof frontmatterSchema>;
```

컴파일타임 타입과 런타임 검증이 같은 정의에서 나온다. 서로 어긋날 수가 없다. 그리고 파일을 읽는 지점에서 실제로 검증한다.

```ts
const parsed = frontmatterSchema.safeParse(data);
if (!parsed.success) {
  throw new Error(`content/posts/${slug}.md의 frontmatter가 스키마와 맞지 않습니다: ...`);
}
```

조용히 통과시키지 않고 빌드를 세운다. 통과시켜봐야 목록에서 제목이 빈 칸으로 나갈 뿐이다.

```
Error: content/posts/foo.md의 frontmatter가 스키마와 맞지 않습니다:
  - description: Invalid input: expected string, received undefined
  - date: YYYY-MM-DD 형식이어야 합니다
```

## 남는 생각

"임시로 any"는 나중에 고치겠다는 약속이었다. 문제는 약속을 안 지킨 게 아니라, **그 `any`가 무엇을 무력화하고 있는지 몰랐다는 것**이다. 알았다면 우선순위가 달랐을 것이다.

지금이라면 이렇게 정리하겠다. `any`를 쓰지 않는다는 규칙보다, **바깥에서 들어온 데이터를 처음 만나는 곳에는 검증을 둔다**는 규칙이 먼저다. 그 자리만 지키면 나머지는 대체로 따라온다.

다음 글에서는 이 블로그에 붙인 콘텐츠 파이프라인 이야기를 쓸 예정이다. 같은 스키마가 사람이 쓴 글과 모델이 생성한 값을 똑같이 검증하게 만든 과정이다.
