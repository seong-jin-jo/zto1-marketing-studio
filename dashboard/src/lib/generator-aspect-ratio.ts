/**
 * 우리가 쓰는 화면비를 그림 생성기가 아는 화면비로 옮긴다.
 *
 * 2026-09-10 실측: 생성기 로그인을 되살리고 나서야 진짜 오류가 보였다.
 * `Invalid values: aspect_ratio=4:5 (allowed: 1:1,16:9,9:16,4:3,3:4,3:2,2:3)`
 *
 * 카드뉴스 기본 화면비는 4:5 다. 인스타그램 세로 규격이라 우리 화면 곳곳이 그 값을 쓴다.
 * 그런데 생성기는 4:5 를 모른다. **그래서 로그인이 살아 있어도 카드뉴스 대표 이미지는
 * 언제나 실패했다.** 로그인이 죽어 있는 동안에는 이 두 번째 벽이 보이지도 않았다.
 *
 * 여기서 배운 것: 앞의 벽이 막고 있으면 뒤의 벽은 안 보인다. 하나를 치우면 반드시 그
 * 다음까지 실제로 돌려 봐야 한다.
 *
 * 옮길 때는 **가장 가까운 세로/가로 비**로 간다. 4:5(0.80)는 3:4(0.75)가 가장 가깝다.
 * 1:1 로 보내면 세로 카드가 정사각이 되어 위아래가 남고, 9:16(0.5625)으로 보내면 너무
 * 길어 잘린다. 둘 다 사용자가 다시 손봐야 하는 결과다.
 */
export const GENERATOR_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"] as const;
export type GeneratorRatio = (typeof GENERATOR_RATIOS)[number];

function ratioValue(ratio: string): number | null {
  const [w, h] = ratio.split(":").map(Number);
  if (!Number.isFinite(w) || !Number.isFinite(h) || h === 0) return null;
  return w / h;
}

/**
 * 생성기가 아는 값이면 그대로, 모르면 가장 가까운 값으로 옮긴다.
 * 아예 알아볼 수 없는 값이면 세로 기본값(9:16)으로 둔다. 우리 결과물 대부분이 세로다.
 */
export function toGeneratorRatio(requested: string | null | undefined): GeneratorRatio {
  const raw = String(requested ?? "").trim().replace(/\s/g, "");
  if ((GENERATOR_RATIOS as readonly string[]).includes(raw)) return raw as GeneratorRatio;
  const target = ratioValue(raw);
  if (target === null) return "9:16";
  let best: GeneratorRatio = "9:16";
  let bestGap = Number.POSITIVE_INFINITY;
  for (const candidate of GENERATOR_RATIOS) {
    const value = ratioValue(candidate);
    if (value === null) continue;
    // 비율은 곱셈으로 멀어진다. 0.8 대 0.75 의 차이와 2.0 대 1.95 의 차이는 눈에 다르게
    // 보인다. 그래서 뺄셈이 아니라 로그 거리로 잰다.
    const gap = Math.abs(Math.log(target) - Math.log(value));
    if (gap < bestGap) { bestGap = gap; best = candidate; }
  }
  return best;
}
