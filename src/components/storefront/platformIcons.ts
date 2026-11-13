import { Facebook, Globe, Instagram, Layers, Music2, Radio, Tv, Twitter, Youtube, type LucideIcon } from "lucide-react";

export const PLATFORM_ICON: Record<string, LucideIcon> = {
  instagram: Instagram, tiktok: Music2, youtube: Youtube, twitter: Twitter, facebook: Facebook,
  tv: Tv, radio: Radio, web: Globe, mixed: Layers,
};

export const PLATFORM_TILE: Record<string, string> = {
  instagram: "linear-gradient(135deg, hsl(330,80%,55%), hsl(20,90%,55%) 55%, hsl(45,95%,55%))",
  tiktok: "linear-gradient(135deg, #010101 0%, #25F4EE 50%, #FE2C55 100%)",
  youtube: "linear-gradient(135deg, hsl(0,85%,45%), hsl(0,85%,55%))",
  twitter: "linear-gradient(135deg, #000, #1a1a1a)",
  facebook: "linear-gradient(135deg, hsl(220,85%,45%), hsl(220,85%,55%))",
  tv: "linear-gradient(135deg, hsl(260,50%,35%), hsl(280,60%,45%))",
  radio: "linear-gradient(135deg, hsl(190,70%,40%), hsl(210,70%,50%))",
  web: "linear-gradient(135deg, hsl(200,20%,25%), hsl(215,25%,40%))",
  mixed: "linear-gradient(135deg, hsl(200,20%,25%), hsl(215,25%,40%))",
};
