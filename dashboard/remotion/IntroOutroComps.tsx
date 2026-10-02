/**
 * Remotion 인트로/아웃트로 컴포지션 — PRD §8.3 렌더 역할 분담.
 *
 * ffmpeg는 컷·합치기·자막 굽기·오디오를 맡고, Remotion은 인트로·아웃트로·움직이는
 * 타이틀만 맡는다(§8.3). 여기는 그 Remotion 쪽 4종: 인트로 2종(로고 리빌, 타이틀 카드),
 * 아웃트로 2종(로고 리빌, 타이틀 카드). 1080x1920, 30fps, 1.5~3초.
 */
import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export interface BrandProps {
  brandName: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  fontFamily?: string;
  titleText?: string;
}

export const DEFAULT_BRAND_PROPS: BrandProps = {
  brandName: "OSMU",
  logoUrl: "",
  primaryColor: "#111827",
  secondaryColor: "#F9FAFB",
  fontFamily: "Pretendard, system-ui, sans-serif",
  titleText: "",
};

function withDefaults(props: Partial<BrandProps>): BrandProps {
  return { ...DEFAULT_BRAND_PROPS, ...props };
}

/** 로고가 커지며 나타나는 인트로/아웃트로 공용 베이스. isOutro=true면 페이드아웃으로 마무리. */
function LogoReveal({ brandName, logoUrl, primaryColor, fontFamily }: BrandProps) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const scale = spring({ frame, fps, config: { damping: 14, mass: 0.6 } });
  const opacity = interpolate(
    frame,
    [0, 6, durationInFrames - 8, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return (
    <AbsoluteFill
      style={{
        backgroundColor: primaryColor,
        alignItems: "center",
        justifyContent: "center",
        opacity,
      }}
    >
      <div style={{ transform: `scale(${scale})`, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        {logoUrl ? (
          <Img src={logoUrl} style={{ width: 220, height: 220, objectFit: "contain" }} />
        ) : null}
        <div style={{ color: "#fff", fontFamily, fontSize: 56, fontWeight: 700, letterSpacing: 1 }}>
          {brandName}
        </div>
      </div>
    </AbsoluteFill>
  );
}

/** 타이틀 문구가 슬라이드/페이드로 등장하는 타이틀 카드. */
function TitleCard({ brandName, titleText, primaryColor, secondaryColor, fontFamily }: BrandProps) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const translateY = interpolate(
    spring({ frame, fps, config: { damping: 16 } }),
    [0, 1],
    [40, 0],
  );
  const opacity = interpolate(
    frame,
    [0, 6, durationInFrames - 8, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return (
    <AbsoluteFill
      style={{
        backgroundColor: secondaryColor,
        alignItems: "center",
        justifyContent: "center",
        opacity,
      }}
    >
      <div style={{ transform: `translateY(${translateY}px)`, textAlign: "center", padding: 40 }}>
        <div style={{ color: primaryColor, fontFamily, fontSize: 64, fontWeight: 800, lineHeight: 1.25 }}>
          {titleText || brandName}
        </div>
        <div style={{ color: primaryColor, fontFamily, fontSize: 28, marginTop: 12, opacity: 0.7 }}>
          {brandName}
        </div>
      </div>
    </AbsoluteFill>
  );
}

export function IntroLogoReveal(props: Partial<BrandProps>) {
  return <LogoReveal {...withDefaults(props)} />;
}
export function OutroLogoReveal(props: Partial<BrandProps>) {
  return <LogoReveal {...withDefaults(props)} />;
}
export function IntroTitleCard(props: Partial<BrandProps>) {
  return <TitleCard {...withDefaults(props)} />;
}
export function OutroTitleCard(props: Partial<BrandProps>) {
  return <TitleCard {...withDefaults(props)} />;
}

export type IntroOutroCompId =
  | "intro-logo-reveal"
  | "intro-title-card"
  | "outro-logo-reveal"
  | "outro-title-card";

export const INTRO_OUTRO_COMPS: Record<
  IntroOutroCompId,
  { component: React.ComponentType<Partial<BrandProps>>; durationInFrames: number; label: string }
> = {
  "intro-logo-reveal": { component: IntroLogoReveal, durationInFrames: 60, label: "인트로 · 로고 리빌 (2s)" },
  "intro-title-card": { component: IntroTitleCard, durationInFrames: 75, label: "인트로 · 타이틀 카드 (2.5s)" },
  "outro-logo-reveal": { component: OutroLogoReveal, durationInFrames: 45, label: "아웃트로 · 로고 리빌 (1.5s)" },
  "outro-title-card": { component: OutroTitleCard, durationInFrames: 90, label: "아웃트로 · 타이틀 카드 (3s)" },
};

export const COMP_WIDTH = 1080;
export const COMP_HEIGHT = 1920;
export const COMP_FPS = 30;
