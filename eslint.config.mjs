import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * 包边界：shared（契约）← api（后端）、web（前端）。
 * api 与 web 互相看不见；它们之间只有 HTTP，类型与常量来自 shared。
 */
const boundary = (files, restricted) => ({
  files,
  rules: {
    "no-restricted-imports": [
      "error",
      {
        // 精确模块名用 paths；带通配符的用 patterns（gitignore 语法，开头的 # 要转义）。
        paths: restricted.flatMap(([names, message]) =>
          names.filter((n) => !n.includes("*")).map((name) => ({ name, message })),
        ),
        patterns: restricted.flatMap(([names, message]) => {
          const group = names.filter((n) => n.includes("*")).map((n) => n.replace(/^#/, "\\#"));
          return group.length ? [{ group, message }] : [];
        }),
      },
    ],
  },
});

const FRAMEWORK = ["react", "react-dom", "react/*", "next", "next/*", "lucide-react"];
const RUNTIME = ["cloudflare:workers"];
const NO_API = [["#api", "#api/*", "**/packages/api/**", "**/api/src/**"], "前端不能依赖后端实现，请通过 HTTP（api/client.ts）与 #shared 契约通信。"];
const NO_WEB = [["#web", "#web/*", "**/packages/web/**", "**/web/src/**"], "后端不能依赖前端。"];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  boundary(["packages/shared/**/*.ts"], [
    NO_API,
    NO_WEB,
    [FRAMEWORK, "shared 只放契约，不依赖 UI 框架。"],
    [RUNTIME, "shared 必须在浏览器与 Worker 中都能运行，不能依赖运行时绑定。"],
    [["@/*"], "shared 不依赖宿主应用。"],
  ]),
  boundary(["packages/api/**/*.ts"], [
    NO_WEB,
    [FRAMEWORK, "API 是与框架无关的 Fetch 处理器，不依赖 React / Next。"],
    [RUNTIME, "运行时绑定由宿主通过 env 传入，API 不直接读取全局。"],
    [["@/*"], "API 不依赖宿主应用。"],
  ]),
  boundary(["packages/web/**/*.{ts,tsx}"], [
    NO_API,
    [["next", "next/*"], "前端不依赖 Next，便于以纯前端方式运行。"],
    [RUNTIME, "前端不能访问 Worker 绑定。"],
    [["drizzle-orm", "drizzle-orm/*"], "前端不接触数据库。"],
  ]),
  {
    files: ["components/ui/**/*.{ts,tsx}", "hooks/use-mobile.ts"],
    rules: {
      // These files are vendored verbatim from shadcn@4.17.0. Keep the
      // registry source intact while applying the stricter rules to Site code.
      "@typescript-eslint/no-unused-vars": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
