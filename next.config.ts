import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/*
 * The browser only ever talks to this app: Supabase and Anthropic are called
 * from the server, fonts are self-hosted by next/font, and no third-party
 * scripts or images load. So the policy can be tight. Next.js needs inline
 * scripts for hydration, and eval only in development (fast refresh).
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // CSV imports arrive through a server action; the default limit is 1 MB.
    // Imports are capped at 4 MB (src/lib/core/import.ts), under Vercel's
    // 4.5 MB request limit, plus room for the multipart envelope.
    serverActions: { bodySizeLimit: "4.4mb" },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
