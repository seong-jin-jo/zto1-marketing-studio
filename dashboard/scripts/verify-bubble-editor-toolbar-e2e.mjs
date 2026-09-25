#!/usr/bin/env node
// PR #85 재검증(BLOCKER: 툴바 mousedown/blur, MAJOR: 문장 끝 Enter 두 줄, MINOR: \r\n
// 정규화·붙여넣기) 실브라우저 E2E. jsdom은 클릭에서 blur를 자동으로 안 일으켜 이
// BLOCKER의 핵심 메커니즘(mousedown → blur → handleBlur가 선택을 무너뜨림)을 재현하지
// 못한다(회장 지시로 재확인) — 그래서 이 스크립트가 Playwright로 Chromium·WebKit·
// Firefox 세 엔진에서 실제 mouse.click을 실행해 검증한다. 리뷰어 탐침
// scratchpad/h/probe3.mjs·ime2.mjs를 레포에 실행 가능한 스크립트로 옮긴 것이다.
//
// 사용: node scripts/verify-bubble-editor-toolbar-e2e.mjs [chromium|webkit|firefox|all]
// dev 서버·인증·DB 불필요 — CardDeckPanel 하나만 esbuild로 번들해 file://로 연다.
import { build } from "esbuild";
import { chromium, firefox, webkit } from "playwright-core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(__dirname, "../src");
const fixtureDir = path.resolve(__dirname, "fixtures/bubble-editor-e2e");
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "bubble-editor-e2e-"));

const engines = { chromium, webkit, firefox };
const requested = process.argv[2] || "all";
const targets = requested === "all" ? Object.keys(engines) : [requested];
for (const name of targets) {
  if (!engines[name]) throw new Error(`알 수 없는 엔진: ${name} (chromium|webkit|firefox|all)`);
}

async function bundle() {
  await build({
    entryPoints: [path.join(fixtureDir, "entry.tsx")],
    bundle: true,
    outfile: path.join(outDir, "app.js"),
    format: "iife",
    jsx: "automatic",
    loader: { ".module.css": "local-css", ".css": "css", ".json": "json" },
    define: { "process.env.NODE_ENV": '"production"' },
    minify: false,
    plugins: [
      {
        name: "alias",
        setup(b) {
          b.onResolve({ filter: /^@\/lib\/auth$/ }, () => ({ path: path.join(fixtureDir, "auth-stub.ts") }));
          b.onResolve({ filter: /^@\// }, async (args) => {
            const resolved = await b.resolve("./" + args.path.slice(2), { resolveDir: srcDir, kind: args.kind });
            return resolved;
          });
        },
      },
    ],
    logLevel: "warning",
  });
  fs.writeFileSync(
    path.join(outDir, "index.html"),
    '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script src="app.js"></script></body></html>',
  );
}

function makeHelpers(page) {
  const nav = (sid) => page.locator(`nav [data-slide-id="${sid}"]`).first().click();
  const sel = (id) => `[data-bubble-id="${id}"] [data-bubble-content-editable]`;
  const ed = (id) => page.locator(sel(id));
  const model = (id) =>
    page.evaluate(
      (bid) => {
        for (const s of window.__deck.slides) {
          for (const b of s.bubbles || []) {
            if (b.id === bid) return b.segments.map((x) => x.text).join("");
          }
        }
        return "MISSING";
      },
      id,
    );
  const bubbleTexts = (sid) =>
    page.evaluate(
      (slideId) => window.__deck.slides.find((s) => s.id === slideId).bubbles.map((b) => b.segments.map((x) => x.text).join("")),
      sid,
    );
  const caretAt = (id, where) =>
    page.evaluate(
      ([selector, w]) => {
        const el = document.querySelector(selector);
        el.focus();
        const r = document.createRange();
        if (w === "end") { r.selectNodeContents(el); r.collapse(false); }
        else if (w === "start") { r.selectNodeContents(el); r.collapse(true); }
        else { r.setStart(el.firstChild, w); r.collapse(true); }
        getSelection().removeAllRanges();
        getSelection().addRange(r);
      },
      [sel(id), where],
    );
  const selectRange = (id, a, b) =>
    page.evaluate(
      ([selector, from, to]) => {
        const el = document.querySelector(selector);
        el.focus();
        const t = el.firstChild;
        const r = document.createRange();
        r.setStart(t, from);
        r.setEnd(t, to);
        getSelection().removeAllRanges();
        getSelection().addRange(r);
      },
      [sel(id), a, b],
    );
  const alerts = () => page.locator("[role=alert]").allInnerTexts();
  return { nav, sel, ed, model, bubbleTexts, caretAt, selectRange, alerts };
}

async function runScenario(engineName) {
  const browser = await engines[engineName].launch({ headless: true });
  const results = [];
  const record = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    results.push({ name, got, want, ok });
    console.log(`[${engineName}] ${ok ? "통과" : "실패"}  ${name}  기대=${JSON.stringify(want)} 실제=${JSON.stringify(got)}`);
  };
  try {
    // MINOR(3) 붙여넣기 시나리오는 진짜 OS 클립보드 + Ctrl/Cmd+V로 검증한다 — 동기 dispatch
    // ClipboardEvent(new DataTransfer 수동 조립)는 Firefox가 synthetic 이벤트의
    // clipboardData를 신뢰하지 않아(getData가 빈 문자열) onPaste 핸들러 자체가 사실상
    // 아무 것도 못 받는다(회장 지시로 재검증 중 3엔진 스크립트로 직접 실측). 실제 사용자
    // 붙여넣기와 완전히 같은 경로(paste.mjs 패턴)를 써서 이 테스트 인프라 문제를 없앤다.
    // 엔진마다 playwright-core가 인식하는 클립보드 권한 이름이 다르다(WebKit·Firefox는
    // "clipboard-write"를 모른다) — 되는 만큼만 요청하고, 그래도 안 되면 권한 없이 연다
    // (Clipboard API 자체는 파일 프로토콜에서도 대개 프롬프트 없이 동작한다).
    let context;
    let page;
    for (const permissions of [["clipboard-read", "clipboard-write"], ["clipboard-read"], []]) {
      try {
        context = await browser.newContext(permissions.length ? { permissions } : {});
        page = await context.newPage();
        break;
      } catch (error) {
        await context?.close().catch(() => {});
        context = undefined;
        if (permissions.length === 0) throw error;
      }
    }
    await page.goto("file://" + path.join(outDir, "index.html"));
    const { nav, sel, ed, model, bubbleTexts, caretAt, selectRange, alerts } = makeHelpers(page);

    // BLOCKER: 굵게 — 실제 마우스 클릭으로 선택 → 굵게 버튼 클릭. mousedown
    // preventDefault가 없으면 클릭 전에 blur가 나 선택이 무너지고 "먼저 선택해 주세요"
    // 경고가 뜬다(probe3.mjs BOLD_click_alerts 실측 회귀).
    await nav("slide-4");
    await ed("b-4-1").click();
    await selectRange("b-4-1", 0, 3);
    await page.locator('[data-bubble-id="b-4-1"] button', { hasText: "굵게" }).click();
    await page.waitForTimeout(100);
    const boldTexts = await bubbleTexts("slide-4");
    record("BLOCKER 굵게: 실제 마우스 클릭으로 굵게가 적용된다(경고 없음)", {
      hasBold: await page.evaluate(() => {
        const b = window.__deck.slides.find((s) => s.id === "slide-4").bubbles.find((x) => x.id === "b-4-1");
        return b.segments.some((s) => s.bold);
      }),
      alerts: await alerts(),
    }, { hasBold: true, alerts: [] });
    void boldTexts;

    // BLOCKER: 쪼개기 — 실제 마우스 클릭.
    await nav("slide-5");
    await ed("b-5-1").click();
    await caretAt("b-5-1", 4);
    const beforeSplitCount = (await bubbleTexts("slide-5")).length;
    await page.locator('[data-bubble-id="b-5-1"] button', { hasText: "쪼개기" }).click();
    await page.waitForTimeout(100);
    const afterSplitCount = (await bubbleTexts("slide-5")).length;
    record("BLOCKER 쪼개기: 실제 마우스 클릭으로 말풍선이 실제로 나뉜다(경고 없음)", {
      countIncreased: afterSplitCount > beforeSplitCount,
      alerts: await alerts(),
    }, { countIncreased: true, alerts: [] });

    // MAJOR: 말풍선 끝에서 Enter 두 번 + 타이핑 — 편집 화면·저장본 줄 수가 같아야 한다.
    await nav("slide-1");
    await ed("b-1-0").click();
    await caretAt("b-1-0", "end");
    await page.keyboard.press("Enter");
    await page.keyboard.type("끝줄");
    await page.keyboard.press("Enter");
    await page.keyboard.type("셋째줄");
    const enterModel = await model("b-1-0");
    record("MAJOR: 끝에서 Enter 두 번 + 타이핑 — 저장본이 정확히 세 줄이다", {
      lineCount: enterModel.split("\n").length,
      text: enterModel,
    }, { lineCount: 3, text: "왜 저만 안 오르죠?\n끝줄\n셋째줄" });

    // MAJOR 보조: blur 뒤에도 같은 줄 수를 유지한다(중복 개행 없음).
    await page.evaluate(() => document.activeElement.blur());
    await page.waitForTimeout(100);
    const afterBlurModel = await model("b-1-0");
    record("MAJOR: blur 뒤에도 줄 수가 그대로다(렌더 보조 br 중복 없음)", {
      lineCount: afterBlurModel.split("\n").length,
    }, { lineCount: 3 });

    // MAJOR 회귀(4차 재검증, 회장 기준 "보이는 대로 발행"): 끝 Enter 후 blur했을 때
    // "화면에 보이는 줄 수"와 "발행 PNG가 실제로 쓰는 wrapSegments의 줄 수"가 같아야
    // 한다. M2 재현: 끝에서 Enter만 치고 아무것도 안 친 채 blur한다 — 예전엔 저장본에
    // 끝 개행이 남아 PNG엔 빈 줄이 하나 더 생기는데 화면엔 그게 안 보였다.
    await nav("slide-3");
    await ed("b-3-0").click();
    await caretAt("b-3-0", "end");
    await page.keyboard.press("Enter");
    await page.evaluate(() => document.activeElement.blur());
    await page.waitForTimeout(100);
    const m2Model = await model("b-3-0");
    const { m2ScreenLineCount, m2WrapLineCount } = await page.evaluate(
      ([selector, bid]) => {
        const el = document.querySelector(selector);
        const range = document.createRange();
        range.selectNodeContents(el);
        const screenLineCount = range.getClientRects().length;
        let segments = [];
        for (const s of window.__deck.slides) {
          for (const b of s.bubbles || []) {
            if (b.id === bid) segments = b.segments;
          }
        }
        return { m2ScreenLineCount: screenLineCount, m2WrapLineCount: window.__wrapSegmentsLineCount(segments) };
      },
      [sel("b-3-0"), "b-3-0"],
    );
    record("MAJOR 회귀: 끝 Enter 후 blur — 저장본에 끝 개행이 안 남고, 화면 줄 수와 발행 PNG(wrapSegments) 줄 수가 같다", {
      modelHasTrailingNewline: m2Model.endsWith("\n"),
      screenLineCount: m2ScreenLineCount,
      wrapSegmentsLineCount: m2WrapLineCount,
    }, {
      modelHasTrailingNewline: false,
      screenLineCount: m2WrapLineCount,
      wrapSegmentsLineCount: m2WrapLineCount,
    });

    // MINOR(1): 말풍선 맨 앞에서 Enter — Chromium·WebKit에서 사라지던 그 결함.
    await nav("slide-2");
    await ed("b-2-1").click();
    await caretAt("b-2-1", "start");
    await page.keyboard.press("Enter");
    const leadingEnterModel = await model("b-2-1");
    record("MINOR(1): 말풍선 맨 앞 Enter가 선행 개행으로 살아남는다", {
      startsWithNewline: leadingEnterModel.startsWith("\n"),
    }, { startsWithNewline: true });

    // MINOR(2): 마우스 mousedown 없이(그래서 onMouseDown preventDefault 보호를 안 거치고)
    // 편집칸 밖으로 포커스가 옮겨진 뒤 굵게를 누른다 — WebKit은 그 blur에서 Selection을
    // 비운다. 키보드 Tab으로 재현하려 했으나 WebKit(Safari 기본값, "전체 키보드 접근"이
    // 꺼진 상태)은 <button>을 애초에 Tab 순서에 안 넣는다(직접 실측: Tab을 눌러도
    // document.activeElement가 body로 간다 — 이 자체가 실제 Safari 기본 동작과 같다).
    // 그래서 같은 메커니즘(마우스 mousedown 없이 포커스가 버튼으로 넘어감)을 재현하는
    // 표준 방법인 `button.focus()`(스크린리더 등 접근성 기술이 실제로 쓰는 경로,
    // probe3.mjs의 "BOLD via keyboard-free: dispatch click without mousedown"과 동일
    // 패턴)로 만든다.
    // slide-4/b-4-1은 위 BLOCKER 굵게 테스트가 이미 굵게를 적용해 그 슬라이드는 "한 장에
    // 굵은 덩이는 하나" 한도를 다 썼다 — 아직 굵은 구간이 없는 slide-3/b-3-1을 쓴다.
    await nav("slide-3");
    await ed("b-3-1").click();
    await caretAt("b-3-1", 0);
    await page.keyboard.press("Shift+ArrowRight");
    await page.keyboard.press("Shift+ArrowRight");
    await page.keyboard.press("Shift+ArrowRight");
    await page.waitForTimeout(50); // selectionchange가 selectionRefs에 저장될 시간을 준다.
    await page.evaluate((bid) => {
      const btn = [...document.querySelectorAll(`[data-bubble-id="${bid}"] button`)].find((b) => b.textContent === "굵게");
      btn.focus(); // mousedown 없이 포커스만 옮긴다 — 편집칸이 blur된다.
      btn.click();
    }, "b-3-1");
    await page.waitForTimeout(100);
    const keyboardBoldModel = await page.evaluate((bid) => {
      for (const s of window.__deck.slides) for (const b of s.bubbles || []) if (b.id === bid) return b.segments.some((x) => x.bold);
      return false;
    }, "b-3-1");
    record("MINOR(2): mousedown 없는 포커스 이동 뒤 굵게가 WebKit에서도 selectionchange로 저장된 범위를 쓴다", {
      hasBold: keyboardBoldModel,
      alerts: await alerts(),
    }, { hasBold: true, alerts: [] });

    // Shift+Enter도 같은 경로.
    await nav("slide-2");
    await ed("b-2-0").click();
    await caretAt("b-2-0", "end");
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("S");
    const shiftEnterModel = await model("b-2-0");
    record("MAJOR: Shift+Enter도 줄이 산다", { lineCount: shiftEnterModel.split("\n").length }, { lineCount: 2 });

    // MINOR(3): HTML 붙여넣기는 text/plain만 남고 \r\n은 \n으로 정규화된다. 실제 OS
    // 클립보드에 text/html + text/plain을 함께 올리고 진짜 Ctrl/Cmd+V를 누른다(브라우저가
    // 리치 포맷을 우선하는 실제 사용자 경로 — paste.mjs와 같은 패턴).
    await nav("slide-6");
    await ed("b-6-0").click();
    await caretAt("b-6-0", "start");
    await page.evaluate(async () => {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob(['<b style="color:red">굵</b><div>둘</div>'], { type: "text/html" }),
          "text/plain": new Blob(["한줄\r\n두줄\n"], { type: "text/plain" }),
        }),
      ]);
    });
    await page.keyboard.press("ControlOrMeta+V");
    await page.waitForTimeout(200);
    const pasteModel = await model("b-6-0");
    record("MINOR(3): 붙여넣기 \\r\\n이 \\n으로 정규화되고 HTML 서식은 버려진다", {
      hasCarriageReturn: pasteModel.includes("\r"),
      startsWithNormalized: pasteModel.startsWith("한줄\n두줄\n"),
      // "<b"만 보면 "<br>"(정상 렌더 요소)까지 걸린다 — 실제 서식 태그(<b>, <b style=...)만 잡는다.
      hasHtmlTag: /<b[\s>]/i.test(await ed("b-6-0").innerHTML()),
    }, { hasCarriageReturn: false, startsWithNormalized: true, hasHtmlTag: false });
  } finally {
    await browser.close();
  }
  return results;
}

async function main() {
  await bundle();
  let anyFail = false;
  const allResults = {};
  for (const engineName of targets) {
    const results = await runScenario(engineName);
    allResults[engineName] = results;
    if (results.some((r) => !r.ok)) anyFail = true;
  }
  const logPath = path.join(outDir, "results.json");
  fs.writeFileSync(logPath, JSON.stringify(allResults, null, 2));
  console.log(`\n결과 저장: ${logPath}`);
  console.log(anyFail ? "\n일부 실패" : "\n전부 통과");
  process.exit(anyFail ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
