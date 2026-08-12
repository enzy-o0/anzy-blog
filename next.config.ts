import type { NextConfig } from "next";

import { basePath } from "./lib/base-path";

/**
 * 이 블로그는 라우트가 전부 정적이라 통째로 export한다. 서버 런타임이 없으므로
 * GitHub Pages 같은 정적 호스팅에 그대로 올라간다.
 *
 * 이전 설정에는 `config.resolve.fallback = { fs: false }` 웹팩 해킹이 있었다.
 * 포스트를 읽는 코드가 pages/api 아래 있어 클라이언트 번들에 딸려 들어갈 위험이 있었기 때문이다.
 * 지금은 lib/posts.ts가 서버 컴포넌트에서만 호출되므로 우회가 필요 없다.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,

  output: "export",

  // GitHub Pages 프로젝트 페이지는 /<repo> 하위로 서빙된다. 루트 배포에서는 빈 문자열.
  basePath,

  // 디렉토리마다 index.html을 만든다. 정적 호스팅이 확장자 없는 경로를 더 안정적으로 찾는다.
  trailingSlash: true,

  // 이미지 최적화는 서버가 필요하다. export에서는 원본을 그대로 내보낸다.
  images: { unoptimized: true },
};

export default nextConfig;
