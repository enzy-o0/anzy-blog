import rehypeHighlight from "rehype-highlight";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

/**
 * 마크다운 → HTML 파이프라인.
 *
 * 이전 구현은 remark-html의 결과 문자열에 `.replaceAll("<pre>", "<pre class='hljs'>")`를
 * 끼얹어 하이라이팅을 흉내냈다. 문자열 치환은 코드블록의 언어를 알 수 없고,
 * 본문에 `<pre>`가 등장하면 같이 오염된다. 여기서는 AST 단계에서 처리한다.
 *
 * remark-rehype는 기본적으로 마크다운 안의 raw HTML을 버린다(allowDangerousHtml 미사용).
 * 따라서 아래 결과물을 dangerouslySetInnerHTML로 넘겨도 원문 HTML이 그대로 주입되지 않는다.
 */
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  // detect(자동 언어 추측)는 켜지 않는다. 언어 없는 코드펜스를 엉뚱하게 칠하느니
  // 색을 입히지 않는 편이 낫다. 언어는 마크다운에서 명시한다.
  .use(rehypeHighlight)
  .use(rehypeStringify);

export async function renderMarkdown(markdown: string): Promise<string> {
  const file = await processor.process(markdown);
  return String(file);
}
