import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

const alias = {
  "@": path.resolve(__dirname, "app"),
  "@shared": path.resolve(__dirname, "shared"),
};

export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    env: {
      VITEST: "true",
    },
    // Cap parallel API integration files against shared TiDB.
    fileParallelism: true,
    maxWorkers: 2,
    projects: [
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "node",
          include: ["api/**/*.test.ts"],
          environment: "node",
          env: { VITEST: "true" },
          testTimeout: 45_000,
          hookTimeout: 90_000,
          sequence: { groupOrder: 0 },
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "jsdom",
          include: ["app/**/*.spec.tsx"],
          environment: "jsdom",
          setupFiles: ["app/test/setup.ts"],
          env: { VITEST: "true" },
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
