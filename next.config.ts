import type { NextConfig } from "next";

/**
 * 이전 설정에는 `config.resolve.fallback = { fs: false }` 웹팩 해킹이 있었다.
 * 포스트를 읽는 코드가 pages/api 아래 있어 클라이언트 번들에 딸려 들어갈 위험이 있었기 때문이다.
 * 지금은 lib/posts.ts가 서버 컴포넌트에서만 호출되므로 우회가 필요 없다.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
