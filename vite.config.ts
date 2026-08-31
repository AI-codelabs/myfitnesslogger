import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      "/api/mfp": {
        target: "http://localhost:8787",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/mfp/, ""),
      },
      "/neon-auth": {
        target: "https://ep-super-butterfly-b1u1cypj.neonauth.c-5.eu-central-1.aws.neon.tech",
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/neon-auth/, "/neondb/auth"),
        configure: (proxy) => {
          // Neon Auth rejects unknown Origin/Referer with 400 INVALID_HOSTNAME.
          // The Lovable preview origin is not a trusted domain, so present the
          // Neon host itself (same thing the Vercel proxy function does).
          proxy.on("proxyReq", (proxyReq) => {
            const origin =
              "https://ep-super-butterfly-b1u1cypj.neonauth.c-5.eu-central-1.aws.neon.tech";
            proxyReq.setHeader("origin", origin);
            proxyReq.setHeader("referer", `${origin}/neondb/auth`);
            proxyReq.removeHeader("x-forwarded-host");
            proxyReq.removeHeader("x-forwarded-proto");
          });
        },
      },

    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
