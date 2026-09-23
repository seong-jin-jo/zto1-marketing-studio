import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

/**
 * 2026-09-23 회장 지적: "영상이 없으면 만들어서라도 배포해야지 없으면 그냥 안하냐."
 *
 * 컨트롤러가 운영 9444 화면을 직접 눌러 확인한 사실:
 * - "카드뉴스 대표 이미지 만들기"는 성공했다(사이드바 자산 수 6→33). 그런데 "방금 만든
 *   것" 칸은 비어 있었다.
 * - 그 상태에서 "숏폼 영상 만들기"를 눌러도 아무 일이 없었다. 오류 문구도, 진행 표시도
 *   없었다.
 *
 * 코드로 확인한 원인(page.tsx):
 * ①`generateCardImages`/`generateShortVideo` 는 비용 산정(`/api/studio/estimate`)과
 *   비용 승인을 `try` 밖에서 불렀다. 그 자리에서 예외가 나면(네트워크 오류·401 등)
 *   아무도 못 잡아 함수가 조용히 죽는다 — 토스트도, `busy` 표시도, `finally` 의
 *   정리도 돌지 않는다. ADR-007(조용한 실패 금지) 위반.
 * ②`genImage`/`genVideo` 는 서버가 `ok: true` 를 주면 `file`/`url` 이 비어 있어도
 *   그대로 `setImg`/`setVid` 를 불렀다. "방금 만든 것" 칸은 `img.file || img.url` 이
 *   있어야만 그려지므로(StudioRooms.tsx `madeImageUrl || madeVideoUrl`), 배달 주소가
 *   빈 성공 응답은 실패보다 조용히 더 나쁘게 사라졌다 — 오류도 결과도 없다.
 *
 * 이 계약은 그 두 결함이 되살아나면(누가 try 를 걷어내거나 빈 배달 주소 가드를
 * 지우면) 실패해야 한다. 되돌려서 실패하는 것까지 확인했다(돌연변이 검증).
 */
const pageSrc = fs.readFileSync(path.resolve(__dirname, "../../src/app/studio/page.tsx"), "utf8");

function sliceFunction(name: string): string {
  const start = pageSrc.indexOf(`async function ${name}(`);
  expect(start, `async function ${name}( 을 찾지 못했다`).toBeGreaterThanOrEqual(0);
  const nextFnMarker = pageSrc.indexOf("\n  async function ", start + 1);
  const end = nextFnMarker > start ? nextFnMarker : start + 6000;
  return pageSrc.slice(start, end);
}

describe("숏폼 영상 생성 조용한 실패 회귀 계약", () => {
  it("SILENT-01: generateCardImages 는 비용 산정·승인부터 생성까지 한 try 안에서 돈다", () => {
    const body = sliceFunction("generateCardImages");
    const tryAt = body.indexOf("try {");
    const estAt = body.indexOf("apiPost<{");
    expect(tryAt, "try 블록이 없다").toBeGreaterThanOrEqual(0);
    expect(estAt, "비용 산정 호출이 없다").toBeGreaterThanOrEqual(0);
    expect(tryAt, "비용 산정 호출이 try 밖에 있다 — 예외가 나면 아무도 못 잡는다").toBeLessThan(estAt);
    expect(body, "예외를 화면에 말하는 catch 가 없다").toMatch(/catch \(e\) \{[\s\S]*extractApiErrorMessage\(e,/);
  });

  it("SILENT-02: generateShortVideo 는 주제 재확인·비용 산정·승인부터 생성까지 한 try 안에서 돈다", () => {
    const body = sliceFunction("generateShortVideo");
    const tryAt = body.indexOf("try {");
    const estAt = body.indexOf("apiPost<{");
    const confirmAt = body.indexOf("decideVideoRequest(");
    expect(tryAt, "try 블록이 없다").toBeGreaterThanOrEqual(0);
    expect(estAt, "비용 산정 호출이 없다").toBeGreaterThanOrEqual(0);
    expect(confirmAt, "주제 재확인 로직이 없다").toBeGreaterThanOrEqual(0);
    expect(tryAt, "주제 재확인이 try 밖에 있다").toBeLessThan(confirmAt);
    expect(tryAt, "비용 산정 호출이 try 밖에 있다 — 예외가 나면 아무도 못 잡는다").toBeLessThan(estAt);
    expect(body, "예외를 화면에 말하는 catch 가 없다").toMatch(/catch \(e\) \{[\s\S]*extractApiErrorMessage\(e,/);
  });

  it("SILENT-03: genImage 는 성공 응답이라도 배달 주소가 없으면 실패로 취급한다", () => {
    const body = sliceFunction("genImage");
    expect(body, "빈 배달 주소 가드가 없다 — ok:true·주소 없음이 조용히 성공 처리된다")
      .toMatch(/if \(!r\.file && !r\.url\) \{[\s\S]*showToast\(msg, "error"\)/);
  });

  it("SILENT-04: genVideo 는 성공 응답이라도 배달 주소가 없으면 실패로 취급한다", () => {
    const body = sliceFunction("genVideo");
    expect(body, "빈 배달 주소 가드가 없다 — ok:true·주소 없음이 조용히 성공 처리된다")
      .toMatch(/if \(!r\.file && !r\.url\) \{[\s\S]*showToast\(msg, "error"\)/);
  });
});
