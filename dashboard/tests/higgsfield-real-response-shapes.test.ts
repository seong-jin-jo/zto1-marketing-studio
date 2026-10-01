import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { extractJobId, extractJson, findResultUrl, normalizeJobStatus } from "@/lib/higgsfield";

// 2026-10-02 독립 리뷰 MAJOR 1/2/3/6 — 실물 Higgsfield 응답으로 재현. 종전 단위 테스트는
// 손으로 쓴 `{"status":"completed","url":"..."}` 류 stub JSON을 썼는데, 실물 응답은 이
// 모양이 아니었다(①작업 id 응답이 객체가 아니라 문자열 배열 ②대기 중 응답에도 바탕/스타일
// 견본 URL이 들어 있어 "URL 있으면 완료"로 오판 ③썸네일(min_result_url)이 결과보다 먼저
// 잡힘). 이 테스트는 레포 픽스처(tests/fixtures/higgsfield/*.json — 컨트롤러가 실제
// `higgsfield` CLI 호출로 캡처, 과금 1회 + 읽기전용 get 3회)를 직접 읽어 라이브러리 함수를
// 실물 shape로 검증한다. 손으로 쓴 가짜 shape 금지.
const FIXTURE_DIR = path.join(__dirname, "fixtures", "higgsfield");

function loadFixture(name: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, name), "utf8"));
}
function loadFixtureRaw(name: string): string {
  return fs.readFileSync(path.join(FIXTURE_DIR, name), "utf8");
}

describe("extractJobId — 실물 create 응답(배열)", () => {
  it("MAJOR 6: `generate create ... --json`(--wait 없음)은 객체가 아니라 작업 id 문자열 배열이다", () => {
    const data = loadFixture("create-image.json");
    expect(Array.isArray(data)).toBe(true);
    expect(extractJobId(data)).toBe("df664d17-429f-4ff7-aae2-1e266cff67ba");
  });

  it("extractJson으로 raw stdout을 거쳐도 동일하게 뽑힌다", () => {
    const raw = loadFixtureRaw("create-image.json");
    const parsed = extractJson(raw);
    expect(extractJobId(parsed)).toBe("df664d17-429f-4ff7-aae2-1e266cff67ba");
  });
});

describe("normalizeJobStatus — 대기 중 응답은 절대 완료로 오판하지 않는다", () => {
  it("MAJOR 1: 이미지 대기 중(in_progress) + params.style.url(스타일 견본 webp) → pending", () => {
    const raw = loadFixtureRaw("get-image-pending.json");
    const data = loadFixture("get-image-pending.json") as Record<string, unknown>;
    expect(data.status).toBe("in_progress");
    expect(data.result_url).toBeNull();
    expect(normalizeJobStatus(data, raw)).toBe("pending");
  });

  it("MAJOR 2: 영상 대기 중(in_progress) + params.input_image.url(바탕 그림 webp) → pending(실패 아님)", () => {
    const raw = loadFixtureRaw("get-video-pending.json");
    const data = loadFixture("get-video-pending.json") as Record<string, unknown>;
    expect(data.status).toBe("in_progress");
    expect(normalizeJobStatus(data, raw)).toBe("pending");
    expect(normalizeJobStatus(data, raw)).not.toBe("failed");
  });

  it("실물 완료 이미지 응답(status: completed) → done", () => {
    const raw = loadFixtureRaw("get-image-done.json");
    const data = loadFixture("get-image-done.json");
    expect(normalizeJobStatus(data, raw)).toBe("done");
  });

  it("실물 완료 영상 응답(status: completed) → done", () => {
    const raw = loadFixtureRaw("get-video-done.json");
    const data = loadFixture("get-video-done.json");
    expect(normalizeJobStatus(data, raw)).toBe("done");
  });

  it("돌연변이 검증: URL 유무만으로 완료 판정하면 이 가드가 깨진다", () => {
    // normalizeJobStatus가 과거처럼 "텍스트에 결과 확장자 URL이 있으면 done"으로
    // 되돌아가면, 대기 중 픽스처(들어있는 webp URL 때문에) 아래 두 단언이 깨진다.
    const pendingImg = loadFixture("get-image-pending.json");
    const pendingVid = loadFixture("get-video-pending.json");
    expect(normalizeJobStatus(pendingImg, "")).not.toBe("done");
    expect(normalizeJobStatus(pendingVid, "")).not.toBe("done");
  });
});

describe("findResultUrl — result_url 필드만 신뢰한다", () => {
  it("MAJOR 3: 완료 이미지는 result_url(원본 png)을 집고, min_result_url(썸네일 webp)을 집지 않는다", () => {
    const data = loadFixture("get-image-done.json") as { result_url: string; min_result_url: string };
    const url = findResultUrl(data, /png|jpe?g|webp/);
    expect(url).toBe(data.result_url);
    expect(url).not.toBe(data.min_result_url);
    expect(url).toMatch(/\.png$/);
  });

  it("완료 영상은 result_url(mp4)을 집고, params.input_image.url(바탕 그림)을 집지 않는다", () => {
    const data = loadFixture("get-video-done.json") as {
      result_url: string; params: { input_image: { url: string } };
    };
    const url = findResultUrl(data, /mp4|webm|mov/);
    expect(url).toBe(data.result_url);
    expect(url).not.toBe(data.params.input_image.url);
    expect(url).toMatch(/\.mp4$/);
  });

  it("대기 중 이미지는 result_url이 없으므로(null) 결과 URL이 없다 — params.style.url을 집지 않는다", () => {
    const data = loadFixture("get-image-pending.json") as { params: { style: { url: string } } };
    const url = findResultUrl(data, /png|jpe?g|webp/);
    expect(url).not.toBe(data.params.style.url);
    expect(url).toBeNull();
  });

  it("대기 중 영상은 result_url이 없으므로 params.input_image.url을 집지 않는다", () => {
    const data = loadFixture("get-video-pending.json") as { params: { input_image: { url: string } } };
    const url = findResultUrl(data, /mp4|webm|mov/);
    expect(url).not.toBe(data.params.input_image.url);
    expect(url).toBeNull();
  });
});
