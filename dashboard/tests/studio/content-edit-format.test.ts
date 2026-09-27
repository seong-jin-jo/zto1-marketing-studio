import { describe, expect, it } from "vitest";
import { POST as validateContent } from "@/app/api/content/validate/route";
import { validateContentEditFormat } from "@/lib/studio/content-edit-format";

describe("Studio 편집 형식 계약", () => {
  it("PR85-R7-M4 글 굵기 세그먼트를 검증하고 보존한다", () => {
    const segments = [{ text: "강조", bold: true }, { text: " 본문", bold: false }];
    const result = validateContentEditFormat({ kind: "text", segments });
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.value).toEqual({ kind: "text", segments });
  });
  it("FMT-UNIT-01 정상: 승인된 영상 비율·자막·속도·목소리를 정규값으로 받는다", () => {
    const result = validateContentEditFormat({
      kind: "video",
      aspectRatio: "16:9",
      subtitleSize: "크게",
      playbackSpeed: 1.25,
      voice: "또렷한 여성",
    });

    expect(result).toEqual({
      valid: true,
      value: {
        kind: "video",
        aspectRatio: "16:9",
        subtitleSize: "크게",
        playbackSpeed: 1.25,
        voice: "또렷한 여성",
      },
      issues: [],
    });
  });

  it("FMT-UNIT-02 거절: 카드뉴스에 영상 전용 비율을 쓰면 필드 오류를 반환한다", () => {
    const result = validateContentEditFormat({
      kind: "card",
      aspectRatio: "9:16",
      subtitleSize: "보통",
      background: "작업실 책상",
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ field: "aspectRatio" })]));
  });

  it("FMT-API-01 정상: 콘텐츠 검증 API가 승인된 카드 형식값을 경고 없이 통과시킨다", async () => {
    const response = await validateContent(new Request("http://localhost/api/content/validate", {
      method: "POST",
      body: JSON.stringify({
        text: "카드뉴스 발행 전 형식 계약을 확인하기 위한 충분히 긴 테스트 본문입니다.",
        edit_format: { kind: "card", aspectRatio: "4:5", subtitleSize: "보통", background: "창밖 새벽" },
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.valid).toBe(true);
    expect(body.warnings).toHaveLength(0);
  });

  it("FMT-API-03 거절: 콘텐츠 검증 API가 허용하지 않은 재생 속도를 invalid_format으로 표시한다", async () => {
    const response = await validateContent(new Request("http://localhost/api/content/validate", {
      method: "POST",
      body: JSON.stringify({
        text: "영상 발행 전 형식 계약을 확인하기 위한 충분히 긴 테스트 본문입니다.",
        edit_format: { kind: "video", aspectRatio: "9:16", subtitleSize: "보통", playbackSpeed: 2, voice: "차분한 남성" },
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.valid).toBe(false);
    expect(body.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ type: "invalid_format" })]));
  });
});
