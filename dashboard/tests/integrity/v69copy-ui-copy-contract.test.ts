import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { setupGuides } from "@/lib/setup-guides";

const ROOT = path.resolve(__dirname, "../..");
const UI_ROOTS = [
  path.join(ROOT, "src/components"),
  path.join(ROOT, "src/app"),
  path.join(ROOT, "src/lib/setup-guides.ts"),
  path.join(ROOT, "src/lib/constants.ts"),
  path.join(ROOT, "src/lib/channel-capabilities.ts"),
];

function sourceFiles(target: string): string[] {
  if (fs.statSync(target).isFile()) return [target];
  return fs.readdirSync(target, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(target, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "api") return [];
      return sourceFiles(child);
    }
    return /\.tsx?$/.test(entry.name) ? [child] : [];
  });
}

function longDashStrings(file: string): string[] {
  const source = fs.readFileSync(file, "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isStringLiteralLike(node) || ts.isJsxText(node)) && /[—–]/.test(node.text)) {
      const line = ast.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      found.push(`${path.relative(ROOT, file)}:${line}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return found;
}

describe("V69-COPY-04 고객 UI 문구 계약", () => {
  it("V69-COPY-04 정상: 연결 안내는 공식 로그인과 지원 경로를 고객 언어로 설명한다", () => {
    const copy = [...setupGuides.threads.quick, setupGuides.threads.detail].join(" ");
    expect(copy).toContain("공식 로그인");
    expect(copy).toContain("지원팀의 안내");
  });

  it("V69-COPY-04 거절: UI 문자열에 긴 대시를 허용하지 않는다", () => {
    const violations = UI_ROOTS.flatMap(sourceFiles).flatMap(longDashStrings);
    expect(violations).toEqual([]);
  });

  it("V69-COPY-05 거절: Threads 기본 안내에 개발자 콘솔 용어를 노출하지 않는다", () => {
    const copy = [...setupGuides.threads.quick, setupGuides.threads.detail].join(" ");
    ["developers.facebook.com", "threads_basic", "threads_content_publish", "User ID", "앱 ID"].forEach((term) => {
      expect(copy).not.toContain(term);
    });
  });

  it("V69-COPY-06 거절: 스튜디오 상단에 내부 AI 실행 이름을 표시하지 않는다", () => {
    const studio = fs.readFileSync(path.join(ROOT, "src/app/studio/page.tsx"), "utf8");
    expect(studio).not.toContain("engine?.label");
    expect(studio).not.toContain("engine?.model");
    expect(studio).toContain("AI 사용 가능");
  });
});
