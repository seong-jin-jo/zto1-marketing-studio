import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SETTINGS_DIR = path.resolve(__dirname, "../../src/components/settings");

const MUST_HAVE_READONLY = [
  "LlmModel.tsx",       // AI Engine의 LLM 설정 (AIEngine.tsx에서 분리됨)
  "ClaudeToken.tsx",
  "StorageSettings.tsx",
  "DesignToolsSettings.tsx",
  "ElevenLabsSettings.tsx",
  "SlackSettings.tsx",
  "KwPlannerSettings.tsx",
];

describe("readonly/edit pattern integrity", () => {
  for (const file of MUST_HAVE_READONLY) {
    it(`${file} must have editing/setEditing pattern`, () => {
      const filePath = path.join(SETTINGS_DIR, file);
      if (!fs.existsSync(filePath)) {
        // 파일이 없으면 skip (아직 안 만들어진 컴포넌트)
        return;
      }
      const content = fs.readFileSync(filePath, "utf-8");
      const hasEditing = content.includes("editing") || content.includes("setEditing");
      expect(hasEditing, `${file} must contain 'editing' or 'setEditing' for readonly/edit pattern`).toBe(true);
    });
  }

  it("CredentialForm must have readOnly prop", () => {
    const filePath = path.resolve(__dirname, "../../src/components/shared/CredentialForm.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("readOnly");
    expect(content).toContain("editable");
  });

  it("V69-COPY-03 연결 정보 입력은 보기/숨기기 전환을 유지한다", () => {
    const filePath = path.resolve(__dirname, "../../src/components/shared/CredentialForm.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("보기");
    expect(content).toContain("숨기기");
  });
});
