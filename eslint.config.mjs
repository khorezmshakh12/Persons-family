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
        {
          // `order by … asc limit N` returns the N *oldest* rows. It shipped
          // twice as "latest messages" and new chat messages silently
          // vanished. For the latest N: order desc + limit in a subquery,
          // re-sort asc outside it. Genuinely want the oldest? Disable the
          // line with the reason.
          selector: "TemplateElement[value.raw=/order\\s+by[^;]*\\basc\\s+limit\\b/i]",
          message:
            "`order by … asc limit N` returns the OLDEST N rows. For 'latest N', order desc + limit in a subquery, then re-sort asc outside it.",
        },
      ],
    },
  },
  {
    // The raw cookie check skips `is_active` and session revocation — a
    // deactivated or signed-out user sailed through every entry point that
    // used it (Materials SSO, profile edits, realtime token). Everything
    // user-facing goes through getAuthState() in src/lib/auth/session.ts.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/auth/session.ts", "src/lib/actions/auth.ts", "src/lib/audit-log.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/gcp/session",
              importNames: ["getCurrentUser"],
              message:
                "Use getAuthState() from '@/lib/auth/session' — getCurrentUser() does not check is_active or revoked sessions.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
