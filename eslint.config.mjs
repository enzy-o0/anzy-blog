import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

/**
 * Next 16에서 `next lint`가 제거되어 eslint를 직접 호출한다.
 * .eslintrc.json(eslintrc 형식) → flat config로 이관.
 */
const config = [
  { ignores: [".next/**", "out/**", "node_modules/**"] },
  ...nextCoreWebVitals,
];

export default config;
