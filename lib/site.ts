/**
 * 사이트 전역 정보. 화면 여러 곳에 흩어지면 고칠 때 빠뜨리는 곳이 생기므로 여기 모은다.
 *
 * ⚠️ bio는 임시 문구다. 본인 소개로 교체할 것.
 *    이 파일 하나만 고치면 홈·푸터·메타데이터에 모두 반영된다.
 */
export const site = {
  name: "Anzy",
  title: "Anzy 블로그",
  description: "마크다운으로 쓰고 빌드타임에 정적으로 굽는 개인 블로그",

  /** TODO: 임시 문구 — 본인 소개로 교체 */
  bio: "프론트엔드를 만듭니다. 만든 것보다 고친 것을 주로 씁니다.",

  links: [
    { label: "GitHub", href: "https://github.com/enzy-o0" },
    { label: "이 블로그의 소스", href: "https://github.com/enzy-o0/anzy-blog" },
  ],
} as const;
