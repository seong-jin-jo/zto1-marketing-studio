import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

// 2026-10-01 회장 지적: 제품에 로그인한 상태에서 이미지 생성을 눌렀더니
// "이미지 생성기에 로그인되어 있지 않습니다. 서버에서 생성기 로그인을 한 번 해 주시면
// 바로 쓰실 수 있습니다." 가 떴다. 고객 계정 로그인 문제로 오해해 화를 냈다. 실제 원인은
// 운영자 측 Higgsfield API 자격증명(토큰 회전으로 만료)이고 고객이 서버 작업을 할 수 없다.
//
// 이 테스트는 소스 문자열을 정적으로 검사한다. route 핸들러를 직접 import 해 실행하면
// hfRun/assertHiggsfieldReady 등 외부 CLI 의존을 모킹해야 하는데, 이 레포의 기존
// higgsfield 라우트 테스트들도 같은 이유로 lib 함수 단위 검증에 그친다
// (dashboard/tests/lib/higgsfield-auth-error.regression-1.test.ts 참고). 여기서는
// 고객 노출 문구 자체가 회귀하지 않는지가 핵심이므로 소스 그렙으로 충분하다.

const ROUTE_FILES = [
  "src/app/api/higgsfield/image/route.ts",
  "src/app/api/higgsfield/video/route.ts",
];

function readRoute(file: string): string {
  return fs.readFileSync(path.join(__dirname, "../../", file), "utf8");
}

// 두 응답 코드(GENERATOR_UNAUTHENTICATED / GENERATOR_UNAVAILABLE) 각각의
// `error: "..."` 리터럴만 정확히 뽑는다. split/pop 방식은 코드가 늘어나면
// 엉뚱한 블록을 집을 수 있어, 코드 마커 앞쪽에서 가장 가까운 error: 리터럴을
// 정규식으로 직접 매칭한다.
function errorMessageFor(src: string, code: "GENERATOR_UNAUTHENTICATED" | "GENERATOR_UNAVAILABLE"): string {
  const codeIdx = src.indexOf(`code: "${code}"`);
  if (codeIdx === -1) throw new Error(`${code} 블록을 찾지 못함`);
  const before = src.slice(0, codeIdx);
  const match = before.match(/error:\s*"([^"]*)"\s*,\s*$/);
  if (!match) throw new Error(`${code} 앞의 error 리터럴을 찾지 못함`);
  return match[1];
}

const RESPONSE_CODES = ["GENERATOR_UNAUTHENTICATED", "GENERATOR_UNAVAILABLE"] as const;
const ROUTE_X_CODE = ROUTE_FILES.flatMap((file) => RESPONSE_CODES.map((code) => [file, code] as const));

describe("Higgsfield 생성기 미인증/미준비 문구 — 고객 관점 (2026-10-01)", () => {
  it.each(ROUTE_FILES)("%s: 고객에게 서버 작업을 시키는 표현이 없다", (file) => {
    const src = readRoute(file);
    expect(src).not.toMatch(/서버에서\s*생성기\s*로그인/);
    expect(src).not.toMatch(/로그인을\s*한\s*번\s*해\s*주시면/);
  });

  // 경계 케이스: UNAUTHENTICATED(인증 만료)뿐 아니라 UNAVAILABLE(미준비)도
  // 같은 오해(계정 로그인 문제)를 살 수 있는 문구다. 두 코드 블록을 각각
  // 독립적으로 검증해야 한쪽만 고치고 다른 쪽을 빠뜨리는 회귀를 잡는다.
  it.each(ROUTE_X_CODE)("%s [%s]: 고객 계정 로그인 문제가 아니라는 취지가 있다", (file, code) => {
    const msg = errorMessageFor(readRoute(file), code);
    expect(msg).toMatch(/로그인\s*문제는\s*아니/);
  });

  it.each(ROUTE_X_CODE)("%s [%s]: em dash를 쓰지 않는다", (file, code) => {
    const msg = errorMessageFor(readRoute(file), code);
    expect(msg).not.toMatch(/—/);
  });

  it.each(ROUTE_X_CODE)("%s [%s]: 지금도 할 수 있는 일(글 카드)을 안내한다", (file, code) => {
    const msg = errorMessageFor(readRoute(file), code);
    expect(msg).toMatch(/글\s*카드는\s*지금도\s*만드실\s*수\s*있습니다/);
  });
});
