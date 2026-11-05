import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Edge functions import this on Deno. Tests stand in for it with vi.mock on the esm.sh address.
      "npm:@supabase/supabase-js@2": "https://esm.sh/@supabase/supabase-js@2.95.0",
    },
  },
});
