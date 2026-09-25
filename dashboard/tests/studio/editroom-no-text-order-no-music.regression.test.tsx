import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// 이 파일은 의도적으로 StudioRooms/StudioPage를 import하지 않는다. 두 모듈을 jsdom에서
// 다시 마운트하면 이미 그 동작을 실행 검증하는 기존 컴포넌트 테스트와 같은 대형 그래프를
// 한 벌 더 만들고, 전체 CI의 장수 워커가 2GB 힙에 닿는다. 여기서는 이번 회귀의 배선 자체를
// 고정하고, 실제 클릭 동작은 editroom-v65와 studio-publish-ui 계약이 계속 맡는다.
const roomSource = readFileSync("src/components/studio/StudioRooms.tsx", "utf8");
const pageSource = readFileSync("src/app/studio/page.tsx", "utf8");

describe("편집실의 글 순서와 배경 음악 제거 회귀", () => {
  it("EDITROOM-NO-DEAD-CONTROLS-01 거절: 글은 순서·추가·삭제 조작을 노출하지 않는다", () => {
    // v70 §4: 영상이 새 VideoEditor 워크벤치로 그려질 때만 목차를 더 안 보인다(회귀
    // 테스트는 그대로 있고, legacy 경로에서는 여전히 목차가 있다 — 조건이 한 항 늘었다).
    expect(roomSource).toContain('{kind !== "text" && !(kind === "video" && onVideoEditChange) ? <nav');
    expect(roomSource).toContain('<TextDocumentEditor lines={safeLines} onLinesChange={onLinesChange} />');
    expect(roomSource).not.toContain('onMove={kind === "text" ? undefined : moveLine}');
    expect(roomSource).not.toContain('onMoveTo={kind === "text" ? undefined : moveLineTo}');
    expect(roomSource).not.toContain('onAdd={kind === "text" ? undefined : addLine}');
    expect(roomSource).not.toContain('onRemove={kind === "text" ? undefined : removeLine}');
  });

  it("EDITROOM-NO-DEAD-CONTROLS-02 정상: 카드뉴스와 영상은 장 순서 이동 배선을 유지한다", () => {
    expect(roomSource).toContain("const moveLine = (index: number, delta: number) => moveLineTo(index, index + delta);");
    expect(roomSource).toContain('onMove={moveLine}');
    expect(roomSource).toContain('onMoveTo={moveLineTo}');
  });

  it("EDITROOM-NO-DEAD-CONTROLS-03 거절: 형식·나레이션 도구에 배경 음악 조작과 미지원 경고가 없다", () => {
    expect(roomSource).toContain('const EDIT_KIND_ORDER = ["text", "card", "video"] as const;');
    expect(roomSource).toContain('const NARRATION_TOOLS: ToolName[] = ["목소리"];');
    expect(roomSource).not.toContain("EDIT_MUSIC_TRACKS,");
    expect(roomSource).not.toContain("EDIT_MUSIC_VOLUMES,");
    expect(roomSource).not.toContain("음악 파일 생성은 아직 제공하지 않습니다");
    expect(roomSource).not.toContain('<span className="block">배경 음악</span>');
  });

  it("EDITROOM-NO-DEAD-CONTROLS-04 정상: 목소리를 바꿔도 기존 audio 저장 payload의 음악 필드를 보존한다", () => {
    expect(roomSource).toContain('const audio = format?.kind === "audio" ? format : defaultContentEditFormat("audio") as AudioFormat;');
    expect(roomSource).toContain("return { musicTrack: audio.musicTrack, musicVolume: audio.musicVolume };");
    expect(roomSource).toContain(": { kind, voice: values.목소리, ...preservedAudio };");
    expect(roomSource).toContain("() => formatFromToolValues(formatKind, toolValues, preservedAudio)");
    expect(pageSource).toContain("edit_format: editFormat");
  });

  it("EDITROOM-NO-DEAD-CONTROLS-05 정상: 기존 audio 초안의 화면 이름은 음악이 아니라 나레이션이다", () => {
    expect(pageSource).toContain('editKind === "text" ? "글" : "나레이션"');
    expect(pageSource).not.toContain('editKind === "text" ? "글" : "음악"');
  });
});
