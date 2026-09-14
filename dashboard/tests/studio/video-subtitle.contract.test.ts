import { describe, expect, it } from "vitest";
import {
  buildSubtitleFilter,
  checkSubtitleLimits,
  escapeDrawText,
  pickSubtitleFont,
  subtitleCues,
  subtitleFfmpegArgs,
  subtitleFontSize,
  wrapSubtitleLine,
  SUBTITLE_FONT_SCALE,
  SUBTITLE_MAX_CHARS_PER_LINE,
  SUBTITLE_MAX_LINES,
} from "@/lib/studio/video-subtitle";

// 2026-09-14 실측(컨트롤러가 발행 대기 중인 영상을 내려받아 프레임을 떠서 확인):
// 편집실에는 "자막 크기" 를 고르는 자리가 있는데 나가는 mp4 에는 글자가 한 자도 없었다.
// 768x768 · 5.875초 · 무음 클립이 그대로 발행 대기에 올라가 있었다. 소리 없는 숏폼에서
// 자막은 내용 전달의 전부다. 이 계약이 그 상태로 되돌아가는 것을 막는다.
describe("영상 자막 굽기", () => {
  const lines = ["계약서 전에 이것부터 보세요", "조건 세 가지를 확인합니다", "상담은 댓글로 남겨 주세요"];

  it("편집실의 장면 대사가 굽는 명령 안에 실제로 들어간다", () => {
    const filter = buildSubtitleFilter({ lines, size: "보통", width: 768, height: 768, durationSec: 5.875 });
    for (const line of lines) {
      expect(filter).toContain(line);
    }
    expect(filter.startsWith("drawtext=")).toBe(true);
    // 확장을 꺼야 퍼센트가 줄을 지우지 않고, 사용자가 쓴 %{...} 도 식으로 실행되지 않는다.
    expect(filter).toContain("expansion=none");
  });

  it("퍼센트가 든 대사가 통째로 살아남는다 — 확장을 끄기 때문이다", () => {
    const filter = buildSubtitleFilter({
      lines: ["오늘 20% 할인", "%{pts} 는 식이 아니라 글자다"],
      size: "보통", width: 1080, height: 1920, durationSec: 6,
    });
    expect(filter).toContain("20% 할인");
    expect(filter).toContain("%{pts} 는 식이 아니라 글자다");
    expect((filter.match(/expansion=none/g) || []).length).toBe(2);
  });

  it("자막 크기 설정이 실제 글자 크기를 바꾼다", () => {
    const small = buildSubtitleFilter({ lines, size: "작게", width: 1080, height: 1920, durationSec: 6 });
    const normal = buildSubtitleFilter({ lines, size: "보통", width: 1080, height: 1920, durationSec: 6 });
    const large = buildSubtitleFilter({ lines, size: "크게", width: 1080, height: 1920, durationSec: 6 });
    expect(small).toContain(`fontsize=${Math.round(1080 * SUBTITLE_FONT_SCALE["작게"])}`);
    expect(normal).toContain(`fontsize=${Math.round(1080 * SUBTITLE_FONT_SCALE["보통"])}`);
    expect(large).toContain(`fontsize=${Math.round(1080 * SUBTITLE_FONT_SCALE["크게"])}`);
    expect(subtitleFontSize("작게", 1080)).toBeLessThan(subtitleFontSize("크게", 1080));
  });

  it("글자 크기는 영상 실제 폭을 따른다 — 1080 을 가정하면 768 짜리 클립에서 화면 밖으로 나간다", () => {
    expect(subtitleFontSize("보통", 768)).toBeLessThan(subtitleFontSize("보통", 1080));
  });

  it("대사를 영상 길이에 나눠 띄우고 마지막 조각은 끝까지 붙인다", () => {
    const cues = subtitleCues({ lines, durationSec: 6, fontSize: 48, maxWidth: 900 });
    expect(cues).toHaveLength(3);
    expect(cues[0].startSec).toBe(0);
    expect(cues[0].endSec).toBeCloseTo(2, 3);
    expect(cues[1].startSec).toBeCloseTo(2, 3);
    // 반올림 때문에 끝에 자막 없는 구간이 남으면 보는 사람은 그것을 잘림으로 읽는다.
    expect(cues[2].endSec).toBeGreaterThan(6);
  });

  it("콜론·퍼센트·따옴표가 섞인 대사로도 명령이 깨지지 않는다", () => {
    // 이 탈출을 빼먹으면 글자 하나 때문에 인코딩 전체가 죽는다.
    const escaped = escapeDrawText("오늘 20% 할인: '마지막' 기회\n지금");
    // 퍼센트는 탈출하지 않고 그대로 둔다. 대신 expansion=none 으로 확장을 끈다.
    // 2026-09-14 운영 환경 실측: `\\%` 도 `%%` 도 "Stray %" 경고와 함께 그 줄 전체를
    // 화면에서 지웠고, 그런데도 인코딩은 성공으로 끝나 눈으로 보기 전엔 몰랐다.
    expect(escaped).toContain("20% 할인");
    expect(escaped).toContain("\\:");
    expect(escaped).not.toContain("'");
    expect(escaped).not.toContain("\n");
  });

  it("긴 한국어 문장은 화면 폭에 맞춰 접는다", () => {
    const wrapped = wrapSubtitleLine("계약서를 쓰기 전에 반드시 확인해야 하는 조건 세 가지를 짚어 드립니다", 60, 600);
    expect(wrapped.length).toBeGreaterThan(1);
    expect(wrapped.join(" ")).toContain("계약서를");
  });

  it("자막은 아래 플랫폼 조작 영역을 피해 띄운다", () => {
    const filter = buildSubtitleFilter({ lines: ["한 줄"], size: "보통", width: 1080, height: 1920, durationSec: 6 });
    // 바닥에 붙이면 릴스·틱톡·Shorts 의 아래 UI 밑으로 들어가 우리가 박은 자막이 안 보인다.
    const y = filter.match(/y=h-(\d+)-text_h/);
    expect(y).not.toBeNull();
    expect(Number(y![1])).toBeGreaterThanOrEqual(Math.round(1920 * 0.16));
  });

  it("굽는 인자는 영상만 다시 인코딩하고 소리는 그대로 복사한다", () => {
    const args = subtitleFfmpegArgs({
      lines, size: "보통", width: 768, height: 768, durationSec: 5.875,
      inputPath: "/tmp/in.mp4", outputPath: "/tmp/out.mp4", fontFile: "/fonts/noto.ttc",
    });
    expect(args).not.toBeNull();
    expect(args).toContain("-vf");
    expect(args).toContain("copy"); // -c:a copy — 이미 붙은 내레이션을 손상시키지 않는다
    expect(args!.at(-1)).toBe("/tmp/out.mp4");
    expect(args!.join(" ")).toContain("/fonts/noto.ttc");
  });

  it("대사가 없으면 굽지 않는다", () => {
    expect(buildSubtitleFilter({ lines: ["", "  "], size: "보통", width: 1080, height: 1920, durationSec: 6 })).toBe("");
    expect(subtitleFfmpegArgs({
      lines: [], size: "보통", width: 1080, height: 1920, durationSec: 6,
      inputPath: "/tmp/in.mp4", outputPath: "/tmp/out.mp4",
    })).toBeNull();
  });

  // 아래 넷은 교차 리뷰(Codex, 2026-09-14)가 짚은 자리를 고정한다.
  it("악의적인 대사로 필터를 탈출하거나 다른 필터를 끼워 넣을 수 없다", () => {
    const attack = "a':x=0,crop=1:1";
    const filter = buildSubtitleFilter({ lines: [attack], size: "보통", width: 1080, height: 1920, durationSec: 6 });
    // 모든 drawtext 는 반드시 text='...' 로 시작한다. 공격 문자열이 새 필터로 해석되면
    // text= 없이 시작하는 조각이 생긴다.
    const pieces = filter.split("drawtext=").slice(1);
    expect(pieces.length).toBe(1);
    expect(pieces.every((piece) => piece.startsWith("text='"))).toBe(true);
    // 공격 문자열은 통째로 **그려질 글자**로만 남는다. 따옴표가 제거돼 묶음을 못 닫는다.
    const drawn = filter.match(/text='([^']*)'/)![1];
    expect(drawn).toContain("crop=1");
    expect(drawn).toContain("\\:");   // 콜론이 인자 구분자로 살아 나가지 못한다
    expect(filter).not.toContain("':x=0");
  });

  it("글꼴 경로도 글자와 같은 규칙으로 탈출한다", () => {
    const filter = buildSubtitleFilter({
      lines: ["한 줄"], size: "보통", width: 1080, height: 1920, durationSec: 6,
      fontFile: "/fonts/it's:weird\\path.ttf",
    });
    expect(filter).toContain("\\:weird");
    expect(filter).not.toContain("its:weird");
  });

  it("자막 줄 수와 줄 길이에 상한이 있다 — 조용히 자르지 않고 거절한다", () => {
    expect(checkSubtitleLimits(["한 줄", "두 줄"]).ok).toBe(true);
    const tooMany = checkSubtitleLimits(Array.from({ length: SUBTITLE_MAX_LINES + 1 }, (_, i) => `줄 ${i}`));
    expect(tooMany).toEqual({ ok: false, reason: "too_many_lines" });
    const tooLong = checkSubtitleLimits(["가".repeat(SUBTITLE_MAX_CHARS_PER_LINE + 1)]);
    expect(tooLong).toEqual({ ok: false, reason: "line_too_long" });
  });

  it("빈 줄은 상한을 세지 않고 걸러낸다", () => {
    const checked = checkSubtitleLimits(["한 줄", "  ", "", "두 줄"]);
    expect(checked.ok && checked.lines).toEqual(["한 줄", "두 줄"]);
  });

  it("한글 글꼴이 하나도 없으면 고르지 않는다 — 네모로 그리느니 사실을 말한다", () => {
    expect(pickSubtitleFont(() => false)).toBeNull();
    expect(pickSubtitleFont((c) => c === "/System/Library/Fonts/Supplemental/AppleGothic.ttf"))
      .toBe("/System/Library/Fonts/Supplemental/AppleGothic.ttf");
    // 직접 지정한 글꼴이 실재하지 않으면 다른 것으로 몰래 바꾸지 않는다.
    expect(pickSubtitleFont(() => false, "/없는/글꼴.ttf")).toBeNull();
  });
});
