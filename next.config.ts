import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL)
  : undefined;

const nextConfig: NextConfig = {
  images: {
    /*
     * Les visuels sont servis depuis Supabase Storage : on n'autorise que cet
     * hôte. Protocole et port sont déduits de l'URL configurée — la stack
     * locale est en `http://127.0.0.1:54321`, un `https` codé en dur y
     * empêcherait tout affichage.
     */
    remotePatterns: supabaseUrl
      ? [
          {
            protocol: supabaseUrl.protocol.replace(":", "") as "http" | "https",
            hostname: supabaseUrl.hostname,
            port: supabaseUrl.port || undefined,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
