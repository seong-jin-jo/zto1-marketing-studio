import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

// 2026-09-13 회장 실사용에서 두 번째로 같은 결함이 나왔다.
//
// 화면 배달 주소(/api/media/<토큰>)에는 12시간짜리 만료가 박혀 있다. 그런데 초안·큐·브라우저
// 자동 저장은 만들 때 받은 주소를 문자열 그대로 보관한다. 그래서 어제 만든 작업을 오늘 열면
// 파일은 서버에 멀쩡히 있는데 그림만 안 뜬다. 배달 경로는 모든 실패를 404 하나로 통일하므로
// 화면에서는 이유조차 알 수 없다. 게다가 날 img·video 태그는 실패해도 아무 말 없이 빈 자리로
// 남아서, 고객은 "만들기가 실패했다" 로 읽는다(ADR-007 조용한 실패 금지 위반).
//
// 고치는 부품은 이미 있다. `DeliveredMedia` 가 만료를 미리 읽어 404 를 맞기 전에 재서명하고,
// 끝내 실패하면 무슨 일이 났고 무엇을 하면 되는지 글로 적는다.
//
// 문제는 강제가 없다는 것이다. 2026-09-08 에 편집실·생성실을 그 부품으로 옮겼는데 발행실이
// 남아 있었고, 2026-09-13 에 발행실을 옮겼더니 큐 카드가 남아 있었다. 새 화면에서 날 <img>
// 를 쓰면 아무도 안 막고, 하루 뒤에 조용히 깨진다. 사람 기억을 강제 장치로 바꾼다.
//
// 계약: src 아래 .tsx 의 날 <img>·<video> 는 전부 둘 중 하나여야 한다.
//   (1) `DeliveredMedia` 로 그린다.
//   (2) 배달 주소가 절대 아님이 그 자리에 적혀 있다 — 바로 위 세 줄 안에 `raw-media-ok:` 와
//       이유를 남긴다.
//
// 이유를 먼 곳의 파일 목록이 아니라 그 줄 옆에 적게 하는 이유가 있다. 파일 단위 허용 목록은
// 한 번 등재되면 그 파일 안의 새 <img> 까지 통째로 열어 준다. 실제로 StudioRooms 는 data:
// URL 글자 카드(정당) 와 배달 주소 미디어(부당) 를 한 파일에서 함께 그린다. 파일로 끊으면
// 못 가른다.
const SRC = resolve(__dirname, "../../src");

/** DeliveredMedia 그 자체. 날 태그를 실제로 그리는 유일한 자리다. */
const COMPONENT = "components/studio/DeliveredMedia.tsx";

const JUSTIFICATION = "raw-media-ok:";
/** 이유 주석을 찾아볼 범위. 바로 위 세 줄이면 eslint-disable 한 줄이 끼어도 닿는다. */
const LOOKBACK = 3;

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) out.push(...tsxFiles(full));
    else if (name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

interface Site {
  file: string;
  line: number;
  tag: string;
}

function unjustifiedRawMedia(): Site[] {
  const found: Site[] = [];
  for (const file of tsxFiles(SRC)) {
    const rel = relative(SRC, file).split("\\").join("/");
    if (rel === COMPONENT) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((text, index) => {
      // 여는 태그가 줄 끝에서 끝나는 여러 줄 JSX 를 반드시 포함해야 한다.
      //   <video
      //     src={url}
      //   />
      // 처음에 `[\s>]` 로 적었더니 "video" 뒤에 아무 글자가 없어 안 걸렸고, 그 틈으로 실제
      // 결함 두 자리(UnifiedPostCard 의 영상, videos 목록의 검수 플레이어)가 통과했다.
      // 2026-09-13 Codex 교차리뷰가 잡았다. 줄 끝($)도 경계로 센다.
      const match = /<(img|video)(?=\s|>|\/|$)/.exec(text);
      if (!match) return;
      const from = Math.max(0, index - LOOKBACK);
      const nearby = lines.slice(from, index + 1).join("\n");
      if (nearby.includes(JUSTIFICATION)) return;
      found.push({ file: rel, line: index + 1, tag: match[1] });
    });
  }
  return found;
}

describe("MEDIA-CONTRACT 배달 주소를 그리는 자리는 스스로 되살아난다", () => {
  it("정상: 날 <img>·<video> 는 DeliveredMedia 를 쓰거나 그 자리에 이유를 남긴다", () => {
    const sites = unjustifiedRawMedia();
    const report = sites.map((s) => `${s.file}:${s.line} <${s.tag}>`).join("\n");
    expect(
      sites,
      [
        "배달 주소가 만료되면 조용히 빈 자리로 남는 <img>·<video> 가 있습니다.",
        "DeliveredMedia 로 바꾸거나, 배달 주소가 아닌 이유를 바로 위에",
        `"${JUSTIFICATION} <이유>" 로 적어 주세요.`,
        report,
      ].join("\n"),
    ).toEqual([]);
  });

  it("경계: 여러 줄 JSX 의 여는 태그도 잡는다", () => {
    // 검사기가 한 줄짜리만 잡으면 태그를 줄바꿈하는 것만으로 계약을 피할 수 있다.
    // 실제로 그 틈으로 결함 두 자리가 빠져나갔다(2026-09-13 Codex 교차리뷰).
    const detect = (line: string) => /<(img|video)(?=\s|>|\/|$)/.exec(line)?.[1] ?? null;
    expect(detect("            <video")).toBe("video");
    expect(detect("  <img")).toBe("img");
    expect(detect("<video src={x} />")).toBe("video");
    expect(detect("<img/>")).toBe("img");
    // 이름이 겹치는 다른 부품까지 잡으면 못 쓰는 검사가 된다.
    expect(detect("<videoPlayer src={x} />")).toBeNull();
    expect(detect("<ImageCard />")).toBeNull();
  });

  it("경계: 이유 표식이 실제로 통하는지 확인한다", () => {
    // 검사기가 표식을 못 읽으면 이 계약은 영원히 통과하는 장식이 된다. 표식이 있는 줄은
    // 통과하고 없는 줄은 걸린다는 것을, 검사기와 같은 규칙으로 여기서 한 번 확인한다.
    const withMark = [`// ${JUSTIFICATION} data: URL 이라 만료가 없다`, `<img src={dataUrl} />`];
    const without = ["<img src={dataUrl} />"];
    const passes = (lines: string[]) => {
      const index = lines.length - 1;
      const nearby = lines.slice(Math.max(0, index - LOOKBACK), index + 1).join("\n");
      return nearby.includes(JUSTIFICATION);
    };
    expect(passes(withMark)).toBe(true);
    expect(passes(without)).toBe(false);
  });

  it("경계: 되살리는 부품 자신은 날 태그를 그려야 하므로 검사에서 뺀다", () => {
    const source = readFileSync(resolve(SRC, COMPONENT), "utf8");
    expect(source).toMatch(/<img\b/);
    expect(source).toMatch(/<video\b/);
    // 뺀 자리가 제 일을 하는지까지 붙들어 둔다. 이 함수가 사라지면 만료를 미리 못 읽는다.
    expect(source).toContain("export function isDeliveryUrlExpired");
  });
});
