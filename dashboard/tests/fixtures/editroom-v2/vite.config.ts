import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: {
    alias: [
      { find: "@/lib/auth", replacement: fileURLToPath(new URL("./auth-proof-stub.ts", import.meta.url)) },
      { find: "@/", replacement: `${fileURLToPath(new URL("../../../src", import.meta.url))}/` },
    ],
  },
});
