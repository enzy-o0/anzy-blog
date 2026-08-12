import rehypeHighlight from "rehype-highlight";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

import { withBasePath } from "./base-path";

/** hast 노드 중 우리가 실제로 들여다보는 부분만. unist-util-visit을 들이지 않으려고 직접 정의한다. */
type HastNode = {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

/** basePath를 붙여야 하는 속성. 마크다운이 만들어내는 것만 다룬다. */
const URL_ATTRIBUTES: Record<string, string> = { img: "src", a: "href" };

/**
 * 마크다운이 만든 절대경로에 basePath를 붙인다.
 *
 * Next의 <Link>/<Image>는 basePath를 알아서 붙이지만, 마크다운에서 나온
 * raw <img>/<a>는 아니다. 하위 경로(GitHub Pages 프로젝트 페이지)로 배포하면
 * `![](/foo.png)`가 그대로 남아 404가 난다.
 */
function rehypeBasePath() {
  return (tree: HastNode) => {
    const visit = (node: HastNode): void => {
      const attribute = node.tagName ? URL_ATTRIBUTES[node.tagName] : undefined;
      const value = attribute ? node.properties?.[attribute] : undefined;
      if (attribute && node.properties && typeof value === "string") {
        node.properties[attribute] = withBasePath(value);
      }
      for (const child of node.children ?? []) visit(child);
    };
    visit(tree);
  };
}

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
  .use(rehypeBasePath)
  .use(rehypeStringify);

export async function renderMarkdown(markdown: string): Promise<string> {
  const file = await processor.process(markdown);
  return String(file);
}
