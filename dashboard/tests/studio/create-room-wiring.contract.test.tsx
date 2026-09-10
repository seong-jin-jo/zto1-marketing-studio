import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

// 2026-09-07 사고 계약.
//
// 회장이 "생성실에는 영상 버튼 자체가 없는데 했다고 거짓보고한 이유" 라고 물었다. 그때
// 세션은 브라우저에서 API 를 직접 불러 200 을 받고 그것을 "화면에서 된다" 로 보고했다.
//
// 첫 수선에서 만든 계약은 이 사고를 못 잡는다. 그 계약은 CreateRoom 에 콜백을 직접 넣어
// 렌더하므로, 페이지가 콜백을 안 넘겨도 초록이다. 즉 "컴포넌트에는 단추가 있는데 페이지가
// 안 이었다" 는 실제 사고 모양을 통과시킨다(2026-09-07 독립 감사 지적).
//
// 그래서 소스 배선 자체를 계약으로 고정한다. 화면에서 만들 수 있다고 말하는 것은
// ①컴포넌트에 단추가 있고 ②페이지가 그 단추에 실제 동작을 넘기고 ③그 동작이 비용 승인을
// 거쳐야 한다. 셋 중 하나만 빠져도 고객은 못 만든다.
const pageSrc = fs.readFileSync(path.resolve(__dirname, "../../src/app/studio/page.tsx"), "utf8");
const roomsSrc = fs.readFileSync(path.resolve(__dirname, "../../src/components/studio/StudioRooms.tsx"), "utf8");

describe("생성실 배선 계약", () => {
  it("CREATE-WIRING-01 정상: 만들 수 있다고 적힌 것은 단추와 페이지 배선이 둘 다 있다", () => {
    for (const testid of ["create-card-image", "create-video"]) {
      expect(roomsSrc, `${testid} 단추가 컴포넌트에 없다`).toContain(`data-testid="${testid}"`);
    }
    expect(pageSrc, "카드뉴스 생성이 페이지에서 안 이어졌다").toMatch(/onGenerateCardImages=\{/);
    expect(pageSrc, "영상 생성이 페이지에서 안 이어졌다").toMatch(/onGenerateVideo=\{/);
  });

  it("CREATE-WIRING-02 정상: 돈이 나가는 생성은 비용 승인을 먼저 받는다", () => {
    for (const fn of ["generateCardImages", "generateShortVideo"]) {
      const body = pageSrc.slice(pageSrc.indexOf(`async function ${fn}(`));
      const upToCall = body.slice(0, body.search(/genImage\(|genVideo\(/));
      expect(upToCall, `${fn} 이 승인 없이 생성을 부른다`).toContain("askCostApproval");
    }
    // 브라우저 기본 확인창은 페이지를 멈춰 세운다. 돈 관문에 쓰지 않는다.
    const costArea = pageSrc.slice(pageSrc.indexOf("async function generateCardImages("));
    expect(costArea.slice(0, costArea.indexOf("async function runOSMU") + 1 || 4000)).not.toContain("window.confirm");
  });

  it("CREATE-WIRING-03 정상: 만든 결과를 만든 자리에서 보여 준다", () => {
    // 2026-09-08: 만료된 배달 주소를 스스로 되살리도록 DeliveredMedia 로 감쌌다.
    // 표식은 그 컴포넌트가 testId 로 받아 붙인다.
    for (const testid of ["create-made-image", "create-made-video"]) {
      expect(roomsSrc, `${testid} 표시 자리가 없다`).toContain(`testId="${testid}"`);
    }
    expect(pageSrc, "만든 그림이 생성실로 안 넘어간다").toMatch(/madeImageUrl=\{/);
    expect(pageSrc, "만든 영상이 생성실로 안 넘어간다").toMatch(/madeVideoUrl=\{/);
  });

  it("CREATE-WIRING-04 정상: 화면에 죽은 생성 함수를 남기지 않는다", () => {
    // 정의만 있고 아무도 안 부르는 생성 함수는 "있는데 안 된다" 로 읽힌다.
    for (const dead of ["async function runOSMU(", "async function autoGenerate("]) {
      expect(pageSrc, `${dead} 가 되살아났다. 화면에 잇거나 지워야 한다`).not.toContain(dead);
    }
  });
});
