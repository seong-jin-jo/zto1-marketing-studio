import { readFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../..");
const workflow = readFileSync(resolve(root, ".github/workflows/diagnose-export-worker.yml"), "utf8");
const executable = workflow
  .split("\n")
  .filter((line) => !/^\s*#/.test(line))
  .join("\n");
const maskProgramMatch = workflow.match(/mask_output\(\) \{\s+perl -pe '\n([\s\S]*?)\n\s+'\n\s+\}/);
if (!maskProgramMatch) throw new Error("mask_output Perl program not found");
const maskProgram = maskProgramMatch[1].replace(/^\s{14}/gm, "");
const safeMaskFunctionMatch = workflow.match(/safe_masked_output\(\) \{\n([\s\S]*?)\n\s{10}\}/);
if (!safeMaskFunctionMatch) throw new Error("safe_masked_output function not found");
const safeMaskFunction = `safe_masked_output() {\n${safeMaskFunctionMatch[1].replace(/^\s{12}/gm, "")}\n}`;
const syntheticSlackToken = ["xo", "xb-", "123456789012-123456789012-abcdefghijklmnopqrstuvwxyz"].join("");
const syntheticOpenAiKey = ["s", "k-proj-", "abcdefghijklmnopqrstuvwxyz1234567890"].join("");
const syntheticAwsAccessKey = ["AK", "IA", "ABCDEFGHIJKLMNOP"].join("");
const syntheticSlackWebhook = [
  ["https://hooks", ".slack.com"].join(""),
  "services",
  ["T0000", "0000"].join(""),
  ["B0000", "0000"].join(""),
  ["secret", "-path"].join(""),
].join("/");

describe("운영 export worker 읽기 전용 진단 workflow 계약", () => {
  it("EXPORT-DIAG-01 정상: 수동 실행을 marketing runner에서 최소 권한으로 수행한다", () => {
    expect(workflow).toMatch(/workflow_dispatch:\s*$/m);
    expect(workflow).toMatch(/runs-on:\s*\[self-hosted, marketing_runner\]/);
    expect(workflow).toContain("permissions: {}");
    expect(workflow).toContain("timeout-minutes: 5");
    expect(workflow).not.toContain("actions/checkout@");
  });

  it("EXPORT-DIAG-02 정상: 작업자 상태, health, 재시작 횟수와 최근 로그 200줄을 읽는다", () => {
    expect(workflow).toContain("com.docker.compose.service=openclaw-studio-export-worker");
    expect(workflow).toContain(".State.Health.Status");
    expect(workflow).toContain(".RestartCount");
    expect(workflow).toContain("process.env.EXPORT_WORKER_HEALTH_PORT??'34620'");
    expect(workflow).toContain("fetch('http://127.0.0.1:'+port,");
    expect(workflow).toContain("AbortSignal.timeout(5000)");
    expect(workflow).toContain("if(!response.ok)process.exitCode=1");
    expect(workflow).toContain("Docker health 상태가 ${health_status}다");
    expect(workflow).toContain("실행 중이 아니므로 health endpoint를 호출하지 않음");
    expect(workflow).toContain("docker logs --tail 200");
  });

  it("EXPORT-DIAG-03 정상: 로그와 health 출력에서 연결 문자열과 자격증명 패턴을 가린다", () => {
    expect(workflow).toContain("mask_output()");
    expect(workflow).toContain("postgres(?:ql)?://");
    expect(workflow).toContain("authorization|token|secret|password");
    expect(workflow).toContain("Bearer\\s+");
    expect(workflow).toContain("gh[pousr]_");
    expect(workflow).toContain("ya29\\.");
    expect(workflow).toContain("eyJ");
    expect(workflow).toContain("::stop-commands::%s");
    expect(workflow).toContain("safe_masked_output");
    expect(workflow.match(/\| safe_masked_output/g)).toHaveLength(3);
  });

  it("EXPORT-DIAG-03B 거절: 실제 마스커가 합성 비밀값과 테넌트 내용을 원문으로 남기지 않는다", () => {
    const sensitive = [
      "postgres://user:password@db.example/test",
      "authorization=Bearer bearer-secret-value",
      "Authorization: Basic YTpi",
      "Proxy-Authorization: Digest digest-short-secret",
      '{"authorization":"Token token-short-secret"}',
      syntheticSlackToken,
      syntheticOpenAiKey,
      syntheticAwsAccessKey,
      syntheticSlackWebhook,
      "https://r2.example/object.png?X-Amz-Credential=credential-secret&X-Amz-Signature=signature-secret",
      "Cookie: session=cookie-secret-value",
      "tenant_id=tenant-secret",
      '{"tenantId":"tenant-camel-secret"}',
      "payload={\\\"caption\\\":\\\"customer-content\\\"}",
      '{"requestPayload":{"caption":"customer-camel-content"}}',
      '{"errorDetail":"customer-error-detail"}',
      "550e8400-e29b-41d4-a716-446655440000",
      "customer@example.com",
      "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH",
    ];
    const masked = execFileSync("perl", ["-pe", maskProgram], {
      input: sensitive.join("\n"),
      encoding: "utf8",
    });
    for (const value of sensitive) expect(masked).not.toContain(value);
    for (const atomicSecret of [
      "password",
      "bearer-secret-value",
      "YTpi",
      "digest-short-secret",
      "token-short-secret",
      syntheticSlackToken,
      syntheticOpenAiKey,
      syntheticAwsAccessKey,
      "secret-path",
      "credential-secret",
      "signature-secret",
      "cookie-secret-value",
      "tenant-secret",
      "tenant-camel-secret",
      "customer-content",
      "customer-camel-content",
      "customer-error-detail",
      "550e8400-e29b-41d4-a716-446655440000",
      "customer@example.com",
      "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH",
    ]) expect(masked).not.toContain(atomicSecret);
    expect(masked).toContain("[REDACTED]");
    expect(masked).toContain("[REDACTED_AUTHORIZATION_LINE]");
    expect(masked).toContain("[REDACTED_SENSITIVE_LOG_LINE]");
    expect(masked).toContain("[REDACTED_UUID]");
    expect(masked).toContain("[REDACTED_QUERY]");
    expect(masked).toContain("[REDACTED_EMAIL]");
    expect(masked).toContain("[REDACTED_HIGH_ENTROPY]");
  });

  it("EXPORT-DIAG-03C 거절: 마스커가 실패하면 출력 재개 뒤에도 단계 실패를 보존한다", () => {
    const probe = spawnSync("bash", ["-c", `mask_output() { return 23; }\n${safeMaskFunction}\nprintf x | safe_masked_output`], {
      encoding: "utf8",
    });
    expect(probe.status).toBe(23);
    expect(probe.stdout).toContain("::stop-commands::");
    expect(probe.stdout).toMatch(/::diag-[^:]+::/);
  });

  it("EXPORT-DIAG-04 정상: DB는 READ ONLY로 역할·RLS와 job/item 상태별 건수만 집계한다", () => {
    expect(workflow).toContain('docker exec -i "$dashboard" node');
    expect(workflow).toContain("void (async () => {");
    expect(workflow).toContain('tx.unsafe("SET TRANSACTION READ ONLY")');
    expect(workflow).toContain("rolsuper AS is_superuser");
    expect(workflow).toContain("rolbypassrls AS has_bypass_rls");
    expect(workflow).toContain("(rolsuper OR rolbypassrls) AS effective_rls_bypass");
    expect(workflow).toContain("row_security_active('public.studio_export_jobs'::regclass) AS jobs_rls_active");
    expect(workflow).toContain("row_security_active('public.studio_export_items'::regclass) AS items_rls_active");
    expect(workflow).toContain("current_setting('app.tenant_id', true), '') <> '' AS tenant_context_set");
    expect(workflow).not.toContain("AS tenant_context\n");
    expect(workflow).toMatch(/FROM studio_export_jobs GROUP BY status ORDER BY status/);
    expect(workflow).toMatch(/FROM studio_export_items GROUP BY status ORDER BY status/);
    expect(workflow).not.toMatch(/SELECT[^\n]*(tenant_id|request_payload|error_detail)/);
    expect(workflow.match(/if: \$\{\{ always\(\) \}\}/g)).toHaveLength(2);
  });

  it("EXPORT-DIAG-05 거절: 배포, 컨테이너 변경, DB 쓰기, 환경 전체 출력이 없다", () => {
    expect(executable).not.toMatch(/docker\s+(?:restart|start|stop|kill|rm)\b/);
    expect(executable).not.toMatch(/docker\s+compose[^\n]*\b(?:up|down|restart)\b/);
    expect(executable).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|CREATE)\b/);
    expect(executable).not.toMatch(/\b(?:env|printenv|set)\b\s*(?:$|[|>])/m);
    expect(workflow).not.toContain('echo "::error::DB 읽기 전용 집계 실패"\n');
  });
});
