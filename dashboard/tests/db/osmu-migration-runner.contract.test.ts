import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dbRoot = resolve(__dirname, "../../db");
const manifest = readFileSync(resolve(dbRoot, "migration-manifest.tsv"), "utf8");
const runner = readFileSync(resolve(dbRoot, "run-migrations.sh"), "utf8");
const deployWorkflow = readFileSync(resolve(__dirname, "../../../.github/workflows/deploy-marketing.yml"), "utf8");
const migrationWorkflow = readFileSync(resolve(__dirname, "../../../.github/workflows/osmu-db-migrate.yml"), "utf8");
const rollbackWriter = readFileSync(resolve(dbRoot, "write-rollback-manifest.sh"), "utf8");
const rollbackRunner = readFileSync(resolve(dbRoot, "rollback-migration.sh"), "utf8");
const rollbackIndexVerifier = readFileSync(resolve(dbRoot, "verify-rollback-indexes.sql"), "utf8");
const migrationMatrix = readFileSync(resolve(__dirname, "../../scripts/verify-generation-migration-matrix.sh"), "utf8");
const guardMigrationSource = readFileSync(resolve(dbRoot, "migrations/20260829_020_generation_guard_expand.sql"), "utf8");
const memberMigration = readFileSync(resolve(dbRoot, "migrations/20260829_030_member_unique_expand.sql"), "utf8");

function manifestRows(): string[][] {
  return manifest.split("\n")
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split("\t"));
}

describe("OSMU explicit migration runner 계약", () => {
  it("GEN-MIG-01 정상: manifest의 모든 SQL checksum이 실제 파일과 일치한다", () => {
    for (const [id, phase, file, expected] of manifestRows()) {
      expect(id).toBeTruthy();
      expect(["baseline", "legacy", "expand-fk", "expand-guard", "expand-member", "prepare-rollback", "expand-export-queue", "contract-generation", "contract-quota", "cleanup"]).toContain(phase);
      const actual = crypto.createHash("sha256").update(readFileSync(resolve(dbRoot, file))).digest("hex");
      expect(actual, `${id} checksum`).toBe(expected);
    }
  });

  it("GEN-MIG-02 거절: 일반 배포는 historical wildcard나 schema replay 없이 read-only preflight만 실행한다", () => {
    expect(deployWorkflow).toContain("bash /db/run-migrations.sh preflight");
    expect(deployWorkflow).not.toMatch(/for migration in \/db\/migrations\/\*\.sql/);
    const preflightStep = deployWorkflow.slice(
      deployWorkflow.indexOf("OSMU DB 스키마 read-only preflight"),
      deployWorkflow.indexOf("이미지 빌드", deployWorkflow.indexOf("OSMU DB 스키마 read-only preflight")),
    );
    expect(preflightStep).not.toContain("schema.sql");
    expect(preflightStep).not.toContain("migrations/*.sql");
  });

  it("GEN-MIG-03 거절: 20260828_010은 baselined로만 기록하고 SQL을 replay하지 않는다", () => {
    expect(manifest).toContain("baseline-20260828-generation\tbaseline\tmigrations/20260828_010_studio_generation.sql");
    expect(runner).toContain('{"historical_sql_executed":false}');
    expect(runner).not.toContain("apply_phase baseline");
  });

  it("GEN-MIG-04 경계: checksum drift, advisory lock, running/failed 재진입을 강제한다", () => {
    expect(runner).toContain("manifest checksum mismatch");
    expect(runner).toContain("ledger checksum mismatch");
    expect(runner).toContain("pg_advisory_lock(hashtext('osmu-schema-migration-v1'))");
    expect(runner).toContain("state='running'");
    expect(runner).toContain("state='failed'");
    expect(runner).toContain("catalog state must be re-evaluated before retry");
  });

  it("GEN-MIG-05 거절: 회원 전역 강제는 expand-member 의 사후 조건으로 남아 있다", () => {
    expect(runner).toContain("assert_compatibility_ready");
    expect(runner).toContain("generation_member_unique OR generation_guard");
    expect(runner).toContain("quota_member_unique OR quota_guard");
    expect(runner).toContain("compatibility app requires member UNIQUE or enabled E1 guard");
    // 배포의 사전 조건이 아니라 확장 단계의 사후 조건이어야 한다. 배포에 걸어 두면
    // 배포가 스스로를 막는다(GEN-MIG-10c).
    expect(runner).toContain('if [ "$PHASE" = "expand-member" ]; then assert_compatibility_ready; fi');
    const preflightCase = runner.slice(runner.indexOf("  preflight)"), runner.indexOf("  bootstrap)"));
    expect(preflightCase).toContain("assert_fingerprint");
    expect(preflightCase).not.toContain("assert_compatibility_ready");
  });

  it("GEN-MIG-06 거절: E3와 C1은 체크박스가 아니라 모든 실행 image digest와 commit을 직접 검증한다", () => {
    expect(migrationWorkflow).not.toContain("compatibility_app_digest_verified");
    expect(migrationWorkflow).toContain("docker ps --filter label=com.docker.compose.service=openclaw-dashboard-osmu");
    expect(migrationWorkflow).toContain("docker container inspect --format '{{.Image}}'");
    expect(migrationWorkflow).toContain("org.opencontainers.image.revision");
    expect(migrationWorkflow).toContain("git merge-base --is-ancestor");
    expect(runner).toContain("VERIFIED_APP_IMAGE_DIGEST");
    expect(runner).toContain("VERIFIED_APP_COMMIT");
  });

  it("GEN-MIG-07 거절: R27 승인 증거 전에는 quota contract를 workflow와 runner에서 실행할 수 없다", () => {
    expect(manifest).toContain("contract-generation\tmigrations/20260829_040_tenant_unique_contract.sql");
    expect(manifest).toContain("contract-quota\tmigrations/20260829_045_quota_tenant_unique_contract.sql");
    expect(migrationWorkflow).toContain("- contract-generation");
    expect(migrationWorkflow).not.toMatch(/^\s+- contract-quota\s*$/m);
    expect(migrationWorkflow).toContain("- prepare-rollback");
    expect(runner).toContain("contract-quota is disabled until an approved R27 member-scope and UTC contract artifact is pinned");
  });

  it("GEN-MIG-07A 거절: member UNIQUE 확장은 FK와 실제 실행 중인 호환 앱 검증을 선행조건으로 요구한다", () => {
    const expandMemberCase = runner.slice(
      runner.indexOf("    expand-member)"),
      runner.indexOf("    prepare-rollback)"),
    );
    expect(expandMemberCase).toContain('require_applied "20260829_010_studio_generation_expand_contract"');
    expect(expandMemberCase).toContain("require_verified_app");
    // guard 적용을 선행조건으로 요구하면 guard 가 이미 깔린 운영 DB에서 확장이 영구히 막힌다.
    // 안전은 require_verified_app 과 중복 감사가 지킨다.
    expect(expandMemberCase).not.toContain("generation_guard_expand");
  });

  it("GEN-MIG-08 거절: FK 수명 migration과 기존 필수 migration은 explicit manifest로만 적용한다", () => {
    expect(manifest).toContain("20260829_010_studio_generation_expand_contract\texpand-fk");
    for (const id of ["20260828_020", "20260828_030", "20260828_040", "20260828_050", "20260828_060"]) {
      expect(manifest).toContain(`${id}_`);
    }
    expect(runner).toContain("apply_legacy_manifest");
    expect(runner).toContain('require_applied "20260829_010_studio_generation_expand_contract"');
  });

  it("S3-MIG-01 정상: 영속 내보내기 대기열은 승인 workflow의 additive 명시 phase다", () => {
    expect(manifest).toContain("20261004_010_studio_export_queue\texpand-export-queue");
    expect(runner).toContain("expand-export-queue");
    expect(migrationWorkflow).toContain("- expand-export-queue");
    const imageObservation = migrationWorkflow.slice(
      migrationWorkflow.indexOf("Observe and verify every running compatibility image"),
      migrationWorkflow.indexOf("COMPATIBILITY_BASE_COMMIT"),
    );
    expect(imageObservation).toContain("expand-export-queue");
  });

  it("GEN-MIG-09 경계: invalid concurrent index는 제거·재생성하고 definition drift는 중단한다", () => {
    expect(memberMigration).toContain("NOT i.indisvalid OR NOT i.indisready");
    expect(memberMigration).toContain("DROP INDEX CONCURRENTLY");
    expect(memberMigration).toContain("member unique index definition drift requires manual recovery");
  });

  it("GEN-MIG-10 거절: fingerprint 정의와 index validity를 검사하고 X 상태를 거절한다", () => {
    expect(runner).toContain("pg_get_constraintdef");
    expect(runner).toContain("i.indisunique AND i.indisvalid AND i.indisready");
    expect(runner).toContain("unsupported generation/quota schema fingerprint");
    expect(runner).toContain('SUPPORTED_AXIS_STATES="S1 S2 S3"');
    expect(runner).toContain("assert_no_duplicates");
  });

  it("GEN-MIG-10a 경계: 축이 어긋난 상태는 앱 지원 집합 안이면 통과하고 배포를 막지 않는다", () => {
    // 배포 preflight 가 S1|S2 를 거절하고, 그 배포가 붙이는 revision 라벨이 없어
    // expand-member 가 막히던 교착의 재발 방지. 앱은 제약 이름을 지정하지 않으므로
    // 두 축이 서로 다른 단계여도 동작한다.
    expect(runner).not.toContain("mixed generation/quota schema fingerprint");
    expect(runner).toContain("axis_supported");
    const skipList = migrationWorkflow.slice(
      migrationWorkflow.indexOf("Observe and verify every running compatibility image"),
      migrationWorkflow.indexOf("COMPATIBILITY_BASE_COMMIT"),
    );
    expect(skipList).toContain("expand-guard");
    expect(skipList).toContain("audit");
  });

  it("GEN-MIG-10c 경계: 배포 preflight 는 readiness false|true 를 거절하지 않되 얇아지지도 않는다", () => {
    // 2026-08-29 운영 실측: fingerprint S1|S2, readiness false|true 로 이틀간 정상 가동 중인데
    // 배포가 그 상태를 거절했다. expand-guard 는 Supabase 권한으로 영구 불가하고,
    // expand-member 는 배포가 붙이는 revision 라벨을 요구해서 배포 없이는 못 돈다.
    // 그래서 배포 preflight 가 자기가 만든 정상 중간 상태를 거절하는 순환이 닫혔다.
    const preflightCase = runner.slice(runner.indexOf("  preflight)"), runner.indexOf("  bootstrap)"));
    expect(preflightCase).toContain("assert_deploy_compatible");
    // 게이트를 끈 것이 아니라 옮긴 것이다. 아래 셋은 preflight 에 그대로 남아야 한다.
    expect(preflightCase).toContain("assert_fingerprint");
    expect(preflightCase).toContain("assert_no_duplicates");
    expect(preflightCase).toContain("assert_runtime_schema");
    // 배포가 요구하는 불변식: 두 장부가 최소 tenant+member 범위의 유효 UNIQUE 로 강제된다.
    expect(runner).toContain("deploy requires a valid tenant+member scoped UNIQUE on both ledgers");
    expect(runner).toContain("axis_supported \"$generation\" || ! axis_supported \"$quota\"");
  });

  it("GEN-MIG-10d 거절: 올라갔던 회원 전역 강제가 사라지면 장부로 되돌림을 잡는다", () => {
    // 같은 지문 S1 이라도 오는 길이 다르다. 아직 안 올라간 S1 은 정상 중간 상태이고,
    // 올라갔다가 내려간 S1 은 절차 밖에서 제약이 지워졌다는 신호다.
    // 지원 집합 검사만으로는 그 둘을 못 가른다. 장부가 가른다.
    expect(runner).toContain("assert_ledger_monotonic");
    expect(runner).toContain("ledger says 20260829_030_member_unique_expand is applied but the member-global UNIQUE it created is gone");
    // 앞으로 가는 단계는 회원 전역 UNIQUE 를 걷어내지 않는다. contract 가 걷어내는 것은
    // tenant 범위 제약이므로 S2 와 S3 둘 다 회원 전역 UNIQUE 를 가진다.
    expect(runner).toContain('axis_has_member_unique() { [ "$1" = "S2" ] || [ "$1" = "S3" ]; }');
    // 되돌림 검사는 배포 게이트 안에 있어야 한다.
    const deployCase = runner.slice(runner.indexOf("assert_deploy_compatible() {"), runner.indexOf("# 앱이 실제로 읽고 쓰는 필수 relation"));
    expect(deployCase).toContain("assert_ledger_monotonic");
    // 방어 장치는 조건부 대체물이라 되돌림 판정 근거가 될 수 없다. 규칙을 걸지 않았음을 못박는다.
    expect(runner).not.toContain("a member-scope guard trigger is missing or disabled");
    expect(guardMigrationSource).toContain("IF NOT generation_member_unique THEN");
    expect(guardMigrationSource).toContain("IF NOT quota_member_unique THEN");
  });

  it("GEN-MIG-10b 거절: 배포 preflight 는 필수 relation·RLS·osmu_service 까지 fail-closed 로 본다", () => {
    const preflightCase = runner.slice(runner.indexOf("  preflight)"), runner.indexOf("  bootstrap)"));
    expect(preflightCase).toContain("assert_runtime_schema");
    expect(runner).toContain("runtime schema audit failed");
    expect(runner).toContain("rls-not-forced");
    expect(runner).toContain("tenant-iso-policy-missing");
    expect(runner).toContain("missing-relation");
    expect(runner).toContain("osmu_service bypasses-rls");
    for (const table of ["drafts", "engagement_items", "published_posts", "studio_generation_idempotency"]) {
      expect(runner).toContain(table);
    }
  });

  it("GEN-MIG-10c 경계: audit 는 읽기 전용이고 구형 DB에서도 죽지 않는다", () => {
    const auditCase = runner.slice(runner.indexOf("  audit)"), runner.indexOf("  preflight)"));
    expect(auditCase).toContain("report_fingerprint");
    expect(auditCase).not.toContain("psql -X -q -v ON_ERROR_STOP=1 -f");
    expect(runner).toContain("to_regclass('public.studio_generation_idempotency')");
    expect(runner).toContain("MISSING");
  });

  it("GEN-MIG-10d 경계: member unique index 정합 검사는 int2vector 경계에 걸리지 않는다", () => {
    // int2vector 를 smallint[] 로 캐스팅하면 lower bound 가 0이라 1-based ARRAY 와 항상 다르다.
    // 그 탓에 index 가 이미 있는 DB에서 expand-member 가 항상 drift 로 중단됐다.
    expect(memberMigration).not.toContain("i.indkey::smallint[]");
    expect(memberMigration).toContain("unnest(i.indkey) WITH ORDINALITY");
    expect(memberMigration).toContain("ARRAY['member_id','operation','idempotency_key']::name[]");
    expect(memberMigration).toContain("ARRAY['member_id','local_date']::name[]");
  });

  it("GEN-MIG-10e 경계: failed 로 남은 장부가 고쳐진 migration 의 재진입을 막지 않는다", () => {
    expect(runner).toContain("ledger_supersede");
    expect(runner).toContain('if [ "$recorded_state" != "failed" ]; then');
  });

  it("GEN-MIG-11 거절: C1 rollback manifest 원본·checksum과 승인 script, cleanup phase를 강제한다", () => {
    expect(migrationWorkflow).toContain("rollback_manifest_run_id");
    expect(migrationWorkflow).toContain("gh run download");
    expect(rollbackWriter).toContain("rollback_deadline_utc");
    expect(rollbackRunner).toContain("rollback-generation");
    expect(rollbackRunner).toContain("UNIQUE USING INDEX");
    expect(manifest).toContain("20260905_010_guard_cleanup\tcleanup");
    expect(runner).toContain("validate_cleanup_deadline");
  });

  it("GEN-MIG-12 거절: credential URI는 psql process argv에 전달하지 않는다", () => {
    expect(runner).not.toMatch(/psql\s+"\$DB_URL/);
    expect(runner).toContain("PGPASSWORD");
    expect(runner).toContain("psql -X");
  });

  it("GEN-MIG-13 거절: rollback attach는 이름과 valid뿐 아니라 대상 테이블과 정확한 열 순서를 검증한다", () => {
    expect(rollbackRunner).toContain("i.indrelid=relation_oid");
    expect(rollbackRunner).toContain("i.indexprs IS NULL AND i.indpred IS NULL");
    expect(rollbackRunner).toContain("array_agg(a.attname ORDER BY keys.ordinality)");
    expect(rollbackRunner).toContain("'tenant_id','member_id','operation','idempotency_key'");
    expect(rollbackRunner).toContain("'tenant_id','member_id','local_date'");
    expect(rollbackRunner).toContain("exact valid rollback index missing or definition drifted");
  });

  it("GEN-MIG-14 정상: 적용된 legacy migration은 checksum만 확인하고 SQL을 재실행하지 않는다", () => {
    const legacyApply = runner.slice(runner.indexOf("apply_legacy_manifest()"), runner.indexOf("assert_exact_rollback_indexes()"));
    expect(legacyApply).toContain('if [ "$state" = "applied" ]');
    expect(legacyApply).toContain("action=checksum-only");
    expect(legacyApply.indexOf('if [ "$state" = "applied" ]')).toBeLessThan(legacyApply.indexOf('transaction_tmp="$(mktemp)"'));
  });

  it("GEN-MIG-15 거절: prepare와 contract, manifest 생성 모두 rollback index exact definition을 검증한다", () => {
    expect(rollbackIndexVerifier).toContain("i.indrelid='public.studio_generation_idempotency'::regclass");
    expect(rollbackIndexVerifier).toContain("i.indrelid='public.studio_free_regeneration_uses'::regclass");
    expect(rollbackIndexVerifier).toContain("i.indexprs IS NULL AND i.indpred IS NULL");
    expect(rollbackIndexVerifier).toContain("i.indnatts=4 AND i.indnkeyatts=4");
    expect(rollbackIndexVerifier).toContain("i.indnatts=3 AND i.indnkeyatts=3");
    expect(runner).toContain("assert_exact_rollback_indexes");
    expect(rollbackWriter).toContain("verify-rollback-indexes.sql");
  });

  it("GEN-MIG-16 거절: previous image는 pull 또는 stopped container로 실존을 확인하고 commit 호환성을 검사한다", () => {
    expect(migrationWorkflow).toContain('docker pull "$PREVIOUS_IMAGE_REF"');
    expect(migrationWorkflow).toContain("docker ps -aq --filter label=com.docker.compose.service=openclaw-dashboard-osmu");
    expect(migrationWorkflow).toContain('docker image inspect --format \'{{.Id}}\' "$image_source"');
    expect(migrationWorkflow).toContain("org.opencontainers.image.revision");
    expect(migrationWorkflow).toContain('git merge-base --is-ancestor "$COMPATIBILITY_BASE_COMMIT" "$previous_commit"');
    expect(migrationWorkflow).toContain('docker create --entrypoint /bin/true "$image_source"');
    expect(migrationWorkflow).toContain("PREVIOUS_COMPATIBLE_IMAGE_DIGEST: ${{ steps.previous.outputs.image_digest }}");
  });

  it("GEN-MIG-17 경합: legacy SQL과 applied ledger는 한 transaction이며 중간 실패는 둘 다 rollback한다", () => {
    expect(runner).toContain("must contain exactly one top-level BEGIN/COMMIT pair");
    expect(runner).toContain("OSMU_TEST_FAIL_AFTER_LEGACY_ID");
    expect(runner).toContain("SELECT 1/0;");
    expect(runner).toContain("atomic_with_ledger");
    expect(runner).toContain("and ledger transaction rolled back");
  });

  it("GEN-MIG-18 정상: CI matrix는 checkout git ownership에 의존하지 않고 제공된 SHA를 검증해 사용한다", () => {
    expect(migrationMatrix).toContain('RUNNER_COMMIT="${RUNNER_COMMIT:-${GITHUB_SHA:-}}"');
    expect(migrationMatrix.indexOf('RUNNER_COMMIT="${RUNNER_COMMIT:-${GITHUB_SHA:-}}"')).toBeLessThan(
      migrationMatrix.indexOf('git -C "$DASHBOARD_DIR/.." rev-parse HEAD'),
    );
    expect(migrationMatrix).toContain('if [ -z "$RUNNER_COMMIT" ]');
    expect(migrationMatrix).toContain('RUNNER_COMMIT or GITHUB_SHA must be a 40-character git SHA');
    expect(migrationMatrix).not.toContain("safe.directory");
  });

  it("GEN-MIG-19 정상: 승인 DB workflow는 host psql 없이 postgres:16 client로 모든 DB script를 실행한다", () => {
    expect(migrationWorkflow).toContain('path: _ci/migrate-${{ github.run_id }}/src');
    expect(migrationWorkflow).toContain('SOURCE_DIR: ${{ github.workspace }}/_ci/migrate-${{ github.run_id }}/src');
    expect(migrationWorkflow).toContain('working-directory: ${{ github.workspace }}/_ci/migrate-${{ github.run_id }}/src');
    const manifestStep = migrationWorkflow.slice(
      migrationWorkflow.indexOf("Build rollback manifest from observed pre-contract state"),
      migrationWorkflow.indexOf("Download the original rollback manifest"),
    );
    const applyStep = migrationWorkflow.slice(
      migrationWorkflow.indexOf("Apply explicit manifest phase"),
      migrationWorkflow.indexOf("Execute approved rollback script"),
    );
    const rollbackStep = migrationWorkflow.slice(migrationWorkflow.indexOf("Execute approved rollback script"));
    for (const step of [manifestStep, applyStep, rollbackStep]) {
      expect(step).toContain("docker run --rm");
      expect(step).toContain("postgres:16");
      expect(step).toContain('-e OSMU_DATABASE_URL');
      expect(step).not.toContain('${{ secrets.OSMU_DATABASE_URL }}:');
      expect(step).toContain('-v "$SOURCE_DIR/dashboard/db":/db:ro');
    }
    expect(manifestStep).toContain('-v "$RUNNER_TEMP":/runner-temp');
    expect(manifestStep).toContain("bash /db/write-rollback-manifest.sh /runner-temp/osmu-rollback-manifest.json");
    expect(applyStep).toContain("bash /db/run-migrations.sh");
    expect(rollbackStep).toContain("bash /db/rollback-migration.sh");
    expect(applyStep).toContain('rollback manifest must be under RUNNER_TEMP');
    expect(rollbackStep).toContain('rollback manifest must be under RUNNER_TEMP');
  });
});
