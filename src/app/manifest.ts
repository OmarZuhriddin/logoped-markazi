import type { MetadataRoute } from "next";

/** Telefonning bosh ekraniga o'rnatish uchun ilova ta'rifi */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Logoped",
    short_name: "Logoped",
    description:
      "Logopedik markaz boshqaruvi: jadval, davomat, mijozlar va to'lovlar.",
    lang: "uz",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Ilova ochilayotganda ko'rinadigan ekran — kunduzgi rejim ranglarida
    // (manifest cookie'ni o'qiy olmaydi, shuning uchun asosiy ko'rinish olingan)
    background_color: "#effbf6",
    theme_color: "#0a7ba5",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
