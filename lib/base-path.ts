/**
 * 배포 경로 접두사.
 *
 * GitHub Pages 프로젝트 페이지는 `https://<user>.github.io/<repo>/` 하위로 서빙되므로
 * 모든 절대경로 앞에 `/<repo>`가 붙어야 한다. 로컬 개발과 루트 배포에서는 빈 문자열이다.
 *
 * next.config.ts와 마크다운 파이프라인이 같은 값을 봐야 하므로 여기 한 곳에 둔다.
 * 값이 갈리면 페이지는 뜨는데 이미지만 404가 나는, 찾기 성가신 방식으로 깨진다.
 */
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * 사이트 루트 기준 절대경로에 basePath를 붙인다.
 *
 * Next의 <Link>와 <Image>는 basePath를 알아서 붙이지만, 마크다운에서 나온
 * raw <img>와 <a>는 그렇지 않다. 그쪽은 이 함수를 통과시킨다.
 */
export function withBasePath(url: string): string {
  if (basePath === "") return url;
  // 사이트 내부 절대경로만 대상이다. //cdn.example.com 같은 프로토콜 상대 URL은 건드리지 않는다.
  if (!url.startsWith("/") || url.startsWith("//")) return url;
  return `${basePath}${url}`;
}
