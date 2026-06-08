import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Edge Functions adalah Deno, di-typecheck terpisah
    "supabase/functions/**",
  ]),

  // Phase 9: ban import lib/supabase/admin di components/ (yang biasanya
  // client component). Server Components di app/ tetap diizinkan karena
  // legit untuk dipakai di Server Action / admin pages.
  //
  // Proteksi build-time tetap di lib/supabase/admin.ts via `import "server-only"`.
  {
    files: ["components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/supabase/admin", "**/lib/supabase/admin"],
              message:
                "components/ adalah client-land. Service role client dilarang di sini. Pakai @/lib/supabase/client (browser) atau panggil server action.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
