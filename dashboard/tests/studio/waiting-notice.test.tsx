import { describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 2026-09-09 실측: 구조 초안 만들기는 글 35초, 영상 54초가 걸린다. 그동안 화면에는 버튼
// 글씨가 "만드는 중" 으로 바뀌는 것 말고 아무 변화가 없었다. 여덟 번을 직접 기다려 봤는데
// 매번 멈춘 것인지 도는 것인지 알 수 없었다. 만든 사람이 그렇게 느끼면 처음 쓰는 사람은
// 확실히 그렇게 느낀다.
//
// 벤치마크(Vrew·Descript·Canva·Buffer)의 공통점은 지금 얼마나 지났고 보통 얼마나 걸리는지를
// 숨기지 않는 것이다. 진행률은 지어내지 않는다. 가짜 진행 막대는 한 번 어긋나면 그때부터
// 아무도 안 믿는다.
const src = readFileSync(
  resolve(process.cwd(), "src/components/studio/StudioRooms.tsx"),
  "utf8",
);

afterEach(() => vi.useRealTimers());

describe("기다리는 화면", () => {
  it("생성 중에 기다림 안내를 띄운다", () => {
    expect(src).toContain("data-waiting-notice");
    expect(src).toContain('{loading ? <WaitingNotice');
  });

  it("지난 시간과 보통 걸리는 시간을 함께 말한다", () => {
    expect(src).toContain("초 지났습니다. 보통 ");
    expect(src).toContain("초쯤 걸립니다");
  });

  it("영상은 글보다 오래 걸린다고 미리 말한다", () => {
    // 같은 값을 쓰면 영상에서 매번 "늦었다" 로 보여 안내가 거짓말이 된다.
    const [, video, text] = src.match(/typicalSeconds=\{primaryKind === "video" \? (\d+) : (\d+)\}/) ?? [];
    expect(Number(video)).toBeGreaterThan(Number(text));
  });

  it("가짜 진행률을 만들지 않는다", () => {
    // 안내 컴포넌트 본문만 본다. 파일 다른 곳의 낱말까지 잡으면 검사가 시끄러워진다.
    const body = src.slice(src.indexOf("function WaitingNotice"), src.indexOf("export function CreateRoom"));
    expect(body).not.toContain("data-waiting-progress");
    expect(body).not.toMatch(/width:\s*`?\$\{/);
    expect(body).toContain("seconds}초 지났습니다");
  });

  it("읽어 주는 프로그램이 변화를 알 수 있게 한다", () => {
    expect(src).toContain('role="status"');
    expect(src).toContain('aria-live="polite"');
  });
});
