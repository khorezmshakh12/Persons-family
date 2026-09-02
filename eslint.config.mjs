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
    // Claude Code tooling, not app source (excluded from deploys via
    // .gcloudignore/.dockerignore already).
    ".agents/**",
  ]),
  {
    // The newest eslint-plugin-react-hooks ships these as errors; this repo
    // predates them and uses the "hydrate state from localStorage / kick off
    // a mount animation" pattern they flag all over. They're worth seeing,
    // not worth blocking every CI run on — downgrade to warnings.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
    },
  },
  {
    // Business time is Asia/Tashkent; the server clock is UTC. Reading
    // "now" via a local Date getter is a recurring bug (a day, or on the
    // 1st a month, behind for ~5h). Force the src/lib/time.ts helpers.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/time.ts", "src/lib/format-date.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.object.type='NewExpression'][callee.object.callee.name='Date'][callee.object.arguments.length=0][callee.property.name=/^(getFullYear|getMonth|getDate|getDay|getHours|getMinutes)$/]",
          message:
            "`new Date().getX()` reads the server's UTC clock. Use src/lib/time.ts (tashkentYmd, tashkentDayKey, startOfTashkentMonthKey, …), or a getUTC* variant on an explicit instant.",
        },
      ],
    },
  },
]);

export default eslintConfig;
