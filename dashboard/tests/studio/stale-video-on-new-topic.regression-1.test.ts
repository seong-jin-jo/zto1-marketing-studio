import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import {
  decideVideoRequest,
  droppedMediaNotice,
  isReusableMedia,
  mediaFreshness,
  mediaTopicKey,
  stalePublishBlock,
} from "@/lib/studio/work-media";

/**
 * 2026-09-14 실측 사고의 회귀 계약. 컨트롤러가 배포된 화면에서 직접 재현했다
 * (`session-state.osmu.md` 2026-09-14 06시 35분).
 *
 * 새로 시작을 누르고 주제를 "동네 미용실 첫 방문 손님이 자주 묻는 세 가지" 로 바꿔 초안을
 * 새로 만들었는데, 숏폼 영상 만들기를 눌러도 **어제 계약 주제로 만든 영상이 그대로 붙었다.**
 * 서버 저장소에 새 mp4 는 하나도 안 생겼다. 화면은 멀쩡해 보이므로 그대로 발행된다.
 *
 * 고정할 것 셋.
 * ① 새 초안을 시작하면 이전 주제의 그림·영상은 이 화면에서 내려간다. 내렸다고 말한다.
 * ② 주제가 바뀌면 생성 요청이 **실제로 나간다.** 옛 그림을 바탕으로 재사용하지 않는다.
 * ③ 같은 주제로 이미 영상이 있으면 중복 과금 전에 한 번 묻는다. 조용히 아무 일도 안 하는
 *    경우는 없다(ADR-007 조용한 실패 금지).
 */
const pageSrc = fs.readFileSync(path.resolve(__dirname, "../../src/app/studio/page.tsx"), "utf8");

const OLD = "계약서 조건 세 가지";
const NEW = "동네 미용실 첫 방문 손님이 자주 묻는 세 가지";

describe("VID-STALE 새 주제에 옛 영상이 붙지 않는다", () => {
  it("VID-STALE-01 주제 도장은 띄어쓰기·대소문자 차이를 같은 주제로 본다", () => {
    expect(mediaTopicKey("  미용실   손님 ")).toBe("미용실 손님");
    expect(mediaTopicKey("Hair Salon")).toBe(mediaTopicKey("hair   salon"));
    expect(mediaTopicKey(undefined)).toBe("");
  });

  it("VID-STALE-02 도장이 다르거나 없는 매체는 지금 주제의 것이 아니다", () => {
    expect(mediaFreshness(null, NEW)).toBe("none");
    expect(mediaFreshness({ topicKey: mediaTopicKey(NEW) }, NEW)).toBe("fresh");
    expect(mediaFreshness({ topicKey: mediaTopicKey(OLD) }, NEW)).toBe("stale");
    // 도장을 찍기 전에 만든 옛 작업물. 안전 쪽으로 다룬다. 재사용하지 않는다.
    expect(mediaFreshness({}, NEW)).toBe("unknown");
    expect(isReusableMedia({}, NEW)).toBe(false);
    expect(isReusableMedia({ topicKey: mediaTopicKey(NEW) }, NEW)).toBe(true);
  });

  it("VID-STALE-03 주제가 바뀌면 묻지 않고 새로 만들고, 옛 그림도 안 쓴다", () => {
    const decision = decideVideoRequest({
      idea: NEW,
      img: { topicKey: mediaTopicKey(OLD) },
      vid: { topicKey: mediaTopicKey(OLD) },
    });
    // 여기서 되물으면 사용자가 취소하고 옛 영상이 그대로 발행된다. 물어서는 안 된다.
    expect(decision.action).toBe("generate");
    expect(decision.baseImage).toBe("new");
    expect(decision.notice).toContain("이전 주제");
  });

  it("VID-STALE-04 같은 주제로 이미 영상이 있으면 중복 과금 전에 한 번 묻는다", () => {
    const same = mediaTopicKey(NEW);
    // 2026-09-16 실측 추가: 재사용은 주제만이 아니라 영상에 맞는 9:16 비율일 때만
    // 허용한다(1:1 대표 이미지를 영상 바탕으로 재사용해 정사각 영상이 나간 사고).
    const decision = decideVideoRequest({ idea: NEW, img: { topicKey: same, aspectRatio: "9:16" }, vid: { topicKey: same } });
    expect(decision.action).toBe("confirm");
    expect(decision.baseImage).toBe("reuse");
    expect(decision.confirm?.description).toContain("비용");
  });

  it("VID-STALE-05 처음 만들 때는 묻지 않고 바로 만든다", () => {
    const first = decideVideoRequest({ idea: NEW, img: null, vid: null });
    expect(first).toEqual({ action: "generate", baseImage: "new" });
    // 방금 이 주제로 9:16 그림을 만들어 뒀으면 그것을 바탕으로 쓴다. 두 번 만들 이유가 없다.
    const withImage = decideVideoRequest({ idea: NEW, img: { topicKey: mediaTopicKey(NEW), aspectRatio: "9:16" }, vid: null });
    expect(withImage).toEqual({ action: "generate", baseImage: "reuse" });
  });

  it("VID-STALE-06 내린 매체는 무엇을 내렸는지 말한다", () => {
    expect(droppedMediaNotice({ img: false, vid: false })).toBeNull();
    expect(droppedMediaNotice({ img: true, vid: true })).toContain("이미지와 영상");
    expect(droppedMediaNotice({ img: false, vid: true })).toContain("영상");
    expect(droppedMediaNotice({ img: true, vid: false })).toContain("이미지");
  });
});

describe("VID-STALE 화면이 그 판정을 실제로 쓴다", () => {
  it("VID-STALE-07 새 초안을 만들면 이전 그림·영상을 내린다", () => {
    const fn = pageSrc.slice(pageSrc.indexOf("async function generateQuickDraft("));
    const body = fn.slice(0, fn.indexOf("async function genImage("));
    expect(body, "새 초안에 옛 그림·영상이 그대로 남는다").toContain("setImg(null); setVid(null);");
    expect(body, "내렸다고 말하지 않는다").toContain("droppedMediaNotice(");
  });

  it("VID-STALE-08 영상 만들기가 주제 도장으로 가른다", () => {
    const fn = pageSrc.slice(pageSrc.indexOf("async function generateShortVideo("));
    const body = fn.slice(0, fn.indexOf("async function save("));
    expect(body, "옛 그림을 그대로 바탕으로 쓴다").toContain("decideVideoRequest({ idea, img, vid })");
    expect(body, "판정을 무시하고 img 로 떨어진다").not.toContain("img?.file || img?.url");
    expect(body, "바탕 그림을 못 찾은 실패가 사라지는 알림뿐이다").toContain("setLastError(`영상: ${msg}`)");
    expect(body, "옛 영상을 화면에 남긴 채 생성한다").toContain("setVid(null)");
  });

  it("VID-STALE-09 만든 매체에 주제 도장을 찍는다", () => {
    expect(pageSrc).toContain("const stamped = { ...r, topicKey: mediaTopicKey(idea) };");
    expect(pageSrc).toContain("setImg(stamped)");
    expect(pageSrc).toContain("setVid(stamped)");
  });

  it("VID-STALE-10 새로 시작은 영상만 남은 상태도 비어 있지 않다고 본다", () => {
    expect(pageSrc, "글이 없고 영상만 남으면 새로 시작이 아무 일도 안 한다")
      .toContain("!createLeftover && !img && !vid");
  });

  /**
   * 2026-09-14 Codex 교차리뷰 P0·P1. 생성 단추에만 판정을 걸면 구멍이 남는다.
   * 주제만 고쳐 놓고 생성 없이 발행하거나 편집실을 거치면 옛 매체가 그대로 나간다.
   */
  it("VID-STALE-11 옛 주제 매체는 발행 문과 편집실 이동에서 막힌다", () => {
    expect(stalePublishBlock({ topicKey: mediaTopicKey(OLD) }, NEW, "영상")).toContain("이전 주제");
    // 도장이 없는 옛 작업물까지 막으면 멀쩡한 저장분을 못 올린다. 재사용만 막고 발행은 연다.
    expect(stalePublishBlock({}, NEW, "영상")).toBeNull();
    expect(stalePublishBlock({ topicKey: mediaTopicKey(NEW) }, NEW, "영상")).toBeNull();
    expect(stalePublishBlock(null, NEW, "이미지")).toBeNull();

    const publishFn = pageSrc.slice(pageSrc.indexOf("async function publish()"));
    expect(publishFn.slice(0, 3000), "발행 문에 옛 주제 매체 관문이 없다")
      .toContain('stalePublishBlock(vid, idea, "영상")');
    const moveFn = pageSrc.slice(pageSrc.indexOf("async function moveToPublish()"));
    expect(moveFn.slice(0, 1500), "편집실 이동에 옛 주제 매체 관문이 없다")
      .toContain("stalePublishBlock(vid, idea");
  });

  it("VID-STALE-12 비용 승인 전에는 영상을 뺏지 않는다", () => {
    const fn = pageSrc.slice(pageSrc.indexOf("async function generateShortVideo("));
    const beforeApproval = fn.slice(0, fn.indexOf("const approved = await askCostApproval"));
    expect(beforeApproval, "승인도 안 했는데 화면의 영상을 먼저 내린다").not.toContain("setVid(null)");
    expect(fn.slice(0, fn.indexOf("async function save(")), "만들기 시작해도 옛 영상이 남는다")
      .toContain("if (decision.notice) setVid(null);");
  });

  it("VID-STALE-13 브라우저가 그린 카드에도 주제 도장을 찍는다", () => {
    // 도장이 없으면 그 그림은 재사용 불가로 판정돼 영상 만들 때 바탕을 또 만든다. 돈이 샌다.
    // 2026-09-22 PR4: recompositeCards 의 chat_bubble(카톡 말풍선 9장) 자리가 세 번째로
    // 늘었다. 같은 도장 패턴을 그대로 재사용했으므로 셋 다 도장이 있다.
    const stamped = pageSrc.match(/file: urls\[0\], imageUrls: urls, topicKey: mediaTopicKey\(idea\)/g) ?? [];
    expect(stamped.length, "카드 그림 중 도장을 안 찍는 자리가 있다").toBe(3);
  });
});
