import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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
  // Route-test harness: generic request/response + mock-backend plumbing legitimately needs `any`
  // (varied handler ctx signatures, an Upstash-shaped mock). Scope the allowance to test/ only —
  // production code keeps the strict no-any bar.
  {
    files: ["test/**/*.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  // Builders and artifact tests must never call `loadServers()`.
  //
  // This rule exists because prose was not enough. lib/registry.ts states the ban in bold and
  // names scripts/build-slugmap.ts as the file it would poison — and that same commit shipped
  // with build-slugmap.ts still calling loadServers(), which by then preferred
  // data/server-index.json. The slug map, which mcpindex-trust keys every verdict by, was being
  // derived from a cache of itself, and lib/slugmapArtifact.test.ts had silently become
  // assert(x === x) while staying green. A builder that reads its own output is
  // self-perpetuating and undetectable; make it a lint error rather than a comment.
  {
    files: ["scripts/build-*.ts", "lib/*Artifact.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "../lib/registry",
              importNames: ["loadServers"],
              message:
                "Use loadServersFromSnapshot(). loadServers() prefers data/server-index.json, so a builder or artifact test calling it reads its own output.",
            },
            {
              name: "./registry",
              importNames: ["loadServers"],
              message:
                "Use loadServersFromSnapshot(). loadServers() prefers data/server-index.json, so a builder or artifact test calling it reads its own output.",
            },
            {
              name: "@/lib/registry",
              importNames: ["loadServers"],
              message:
                "Use loadServersFromSnapshot(). loadServers() prefers data/server-index.json, so a builder or artifact test calling it reads its own output.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
