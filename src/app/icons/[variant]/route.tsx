import { ImageResponse } from "next/og";

/**
 * Icônes PWA générées à la volée, puis figées par le cache CDN.
 *
 * Les variantes sont énumérées statiquement (`generateStaticParams`) : elles
 * sont donc rendues au build et servies comme des fichiers statiques, tout en
 * restant modifiables en JSX plutôt qu'en binaire.
 */
const VARIANTS = {
  "192.png": { size: 192, maskable: false },
  "512.png": { size: 512, maskable: false },
  "maskable-512.png": { size: 512, maskable: true },
} as const;

type Variant = keyof typeof VARIANTS;

export function generateStaticParams() {
  return Object.keys(VARIANTS).map((variant) => ({ variant }));
}

export const dynamicParams = false;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ variant: string }> },
) {
  const { variant } = await params;
  const config = VARIANTS[variant as Variant];

  if (!config) {
    return new Response("Not found", { status: 404 });
  }

  const { size, maskable } = config;

  // Une icône maskable peut être rognée jusqu'à 20 % par le système : le
  // monogramme doit rester dans la « safe zone » centrale.
  const scale = maskable ? 0.62 : 0.78;
  const radius = maskable ? 0 : size * 0.22;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #f43f5e 0%, #a21caf 55%, #7c3aed 100%)",
          borderRadius: radius,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: size * scale,
            fontWeight: 700,
            color: "#ffffff",
            letterSpacing: -size * 0.03,
            lineHeight: 1,
          }}
        >
          M
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
