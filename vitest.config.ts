// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { conditions: ["usnea-src"] },
  test: {
    include: [
      "{packages,plugins,compat,importers,shells,examples}/*/{src,test}/**/*.test.ts",
      "{packages,plugins,compat,importers,shells,examples}/*/*/{src,test}/**/*.test.ts",
    ],
    exclude: ["**/node_modules/**", "**/dist/**"],
    passWithNoTests: true,
  },
});
