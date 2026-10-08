import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const WORKFLOWS_DIR = path.join(REPO_ROOT, ".github/workflows");
const DEPLOY_WORKFLOW = "deploy-marketing.yml";
const DB_MIGRATION_WORKFLOW = "osmu-db-migrate.yml";
const DB_MIGRATION_CHECKOUT_PATH = "source-migration";

type WorkflowSource = {
  filename: string;
  source: string;
};

function marketingRunnerWorkflows(): WorkflowSource[] {
  return readdirSync(WORKFLOWS_DIR)
    .filter((filename) => /\.ya?ml$/.test(filename))
    .map((filename) => ({
      filename,
      source: readFileSync(path.join(WORKFLOWS_DIR, filename), "utf8"),
    }))
    .filter(({ source }) => /\bmarketing_runner\b/.test(source));
}

function checkoutPaths(source: string): string[] {
  const lines = source.split("\n");
  const paths: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!/uses:\s*actions\/checkout@/.test(line)) continue;

    const stepIndent = line.match(/^\s*/)?.[0].length ?? 0;
    const block: string[] = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const candidate = lines[cursor];
      const candidateIndent = candidate.match(/^\s*/)?.[0].length ?? 0;
      if (candidate.trim() && candidateIndent <= stepIndent) break;
      block.push(candidate);
    }

    const pathLine = block.find((candidate) => /^\s*path:\s*\S/.test(candidate));
    paths.push(pathLine?.replace(/^\s*path:\s*/, "").replace(/^['\"]|['\"]$/g, "") ?? "");
  }

  return paths;
}

function defaultWorkingDirectory(source: string): string {
  return source.match(/defaults:\s*\n\s*run:\s*\n\s*working-directory:\s*(\S.*)/)?.[1]
    .replace(/^['\"]|['\"]$/g, "") ?? "";
}

function workingDirectoriesAfterCheckout(source: string): string[] {
  const checkoutIndex = source.search(/uses:\s*actions\/checkout@/);
  const postCheckoutSource = checkoutIndex >= 0 ? source.slice(checkoutIndex) : "";
  return [...postCheckoutSource.matchAll(/^\s*working-directory:\s*(\S.*)$/gm)].map((match) =>
    match[1].replace(/^['\"]|['\"]$/g, ""),
  );
}

function workspaceRelative(value: string): string {
  return value.replace(/^\$\{\{\s*github\.workspace\s*\}\}\/?/, "").replace(/^\.\//, "");
}

function isSafeChildPath(value: string): boolean {
  const normalized = workspaceRelative(value);
  return normalized.length > 0
    && normalized !== "."
    && !path.posix.isAbsolute(normalized)
    && !normalized.split("/").includes("..");
}

describe("운영 marketing_runner 워크스페이스 격리 계약", () => {
  const workflows = marketingRunnerWorkflows();
  const nonDeployWorkflows = workflows.filter(({ filename }) => filename !== DEPLOY_WORKFLOW);
  const dbMigrationWorkflow = workflows.find(({ filename }) => filename === DB_MIGRATION_WORKFLOW);

  it("CI-RUNNER-WORKSPACE-ISOLATION-01 정상: 새 비배포 워크플로까지 전부 검사한다", () => {
    expect(workflows.map(({ filename }) => filename)).toContain(DEPLOY_WORKFLOW);
    expect(nonDeployWorkflows.length).toBeGreaterThan(0);
  });

  it("CI-RUNNER-WORKSPACE-ISOLATION-02 거절: 비배포 checkout은 GITHUB_WORKSPACE 루트가 아닌 하위 폴더만 쓴다", () => {
    for (const { filename, source } of nonDeployWorkflows) {
      for (const checkoutPath of checkoutPaths(source)) {
        expect(
          isSafeChildPath(checkoutPath),
          `${filename}: actions/checkout path 누락 또는 루트 checkout`,
        ).toBe(true);
      }
    }
  });

  it("CI-RUNNER-WORKSPACE-ISOLATION-03 거절: checkout 뒤 run working-directory도 checkout 하위에 남는다", () => {
    for (const { filename, source } of nonDeployWorkflows) {
      const checkedOut = checkoutPaths(source).map(workspaceRelative);
      if (checkedOut.length === 0) continue;

      expect(
        source,
        `${filename}: checkout job의 모든 run step이 상속할 defaults.run.working-directory 필요`,
      ).toMatch(/defaults:\s*\n\s*run:\s*\n\s*working-directory:\s*\S/);

      const directories = [
        defaultWorkingDirectory(source),
        ...workingDirectoriesAfterCheckout(source),
      ];
      expect(directories[0], `${filename}: defaults.run.working-directory 누락`).not.toBe("");
      for (const workingDirectory of directories) {
        const relative = workspaceRelative(workingDirectory);
        expect(
          checkedOut.some((checkoutPath) => relative === checkoutPath || relative.startsWith(`${checkoutPath}/`)),
          `${filename}: ${workingDirectory}가 checkout 하위가 아님`,
        ).toBe(true);
      }
    }
  });

  it("CI-RUNNER-WORKSPACE-ISOLATION-04 거절: 비배포 워크플로는 루트 git clean 또는 rm -rf를 실행하지 않는다", () => {
    for (const { filename, source } of nonDeployWorkflows) {
      const executableSource = source
        .split("\n")
        .filter((line) => !/^\s*#/.test(line))
        .join("\n");

      expect(executableSource, `${filename}: git clean 금지`).not.toMatch(/(^|[;&|]\s*)git\s+clean\b/m);
      expect(executableSource, `${filename}: GITHUB_WORKSPACE rm -rf 금지`).not.toMatch(
        /rm\s+-[^\n]*rf[^\n]*(?:GITHUB_WORKSPACE|github\.workspace)/,
      );
      expect(executableSource, `${filename}: GITHUB_WORKSPACE를 /w에 마운트한 root wipe 금지`).not.toMatch(
        /-v\s+["']?\$GITHUB_WORKSPACE["']?:\/w[\s\S]*?rm\s+-rf\s+\/w\//,
      );
    }
  });

  it("CI-RUNNER-WORKSPACE-ISOLATION-05 정상: DB migration은 운영에서 검증된 root child 고정 경로를 쓴다", () => {
    expect(dbMigrationWorkflow, `${DB_MIGRATION_WORKFLOW} 누락`).toBeDefined();
    expect(checkoutPaths(dbMigrationWorkflow!.source)).toEqual([DB_MIGRATION_CHECKOUT_PATH]);
    expect(dbMigrationWorkflow!.source).toContain(
      `SOURCE_DIR: \${{ github.workspace }}/${DB_MIGRATION_CHECKOUT_PATH}`,
    );
    expect(dbMigrationWorkflow!.source).toContain(
      `working-directory: \${{ github.workspace }}/${DB_MIGRATION_CHECKOUT_PATH}`,
    );
  });

  it("CI-RUNNER-WORKSPACE-ISOLATION-06 거절: migration 실행은 겹치지 않고 경로 생성 실패 때 권한 원인을 남긴다", () => {
    expect(dbMigrationWorkflow, `${DB_MIGRATION_WORKFLOW} 누락`).toBeDefined();
    expect(dbMigrationWorkflow!.source).toMatch(
      /concurrency:\s*\n\s*group:\s*osmu-approved-db-migration\s*\n\s*cancel-in-progress:\s*false/,
    );
    expect(dbMigrationWorkflow!.source).toContain("name: Prepare isolated checkout directory");
    expect(dbMigrationWorkflow!.source).toContain('mkdir -p "$CHECKOUT_DIR"');
    expect(dbMigrationWorkflow!.source).toContain("workspace owner=%U group=%G mode=%a");
  });
});
