import path from "node:path";
import { mutateJson, readJson } from "@/lib/file-io";
import { studioDir } from "@/lib/higgsfield";

export type SubtitleBakeLineage =
  | { state: "baked"; sourceFilename?: string }
  | { state: "unbaked" }
  | { state: "unknown" };

type SubtitleBakeRecord = {
  sourceFilename: string;
  createdAt: string;
};

type SubtitleBakeRegistry = {
  version: 1;
  outputs: Record<string, SubtitleBakeRecord>;
};

const EMPTY_REGISTRY: SubtitleBakeRegistry = { version: 1, outputs: {} };
const REGISTRY_FILENAME = ".subtitle-bakes.json";
const MAX_RECORDS = 500;
const SUBTITLE_OUTPUT_PATTERN = /^subtitle-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[a-z0-9]+$/i;
const HIGGSFIELD_ORIGINAL_PATTERN = /^vid(?:silent)?_\d+\.mp4$/i;
const UPLOADED_ORIGINAL_PATTERN = /^[0-9a-f]{12}\.(?:mp4|mov|m4v|webm)$/i;

function registryPath(tenantId: string): string {
  return path.join(studioDir(tenantId), REGISTRY_FILENAME);
}

export function subtitleBakeOutputFilename(randomFilename: string): string {
  return `subtitle-${randomFilename}`;
}

export function isSubtitleBakeOutputFilename(filename: string): boolean {
  return SUBTITLE_OUTPUT_PATTERN.test(filename);
}

/**
 * 서버가 직접 만든 자막 없는 원본만 이름으로 복구한다.
 * Higgsfield 완료 경로는 vid_<timestamp>.mp4 또는 vidsilent_<timestamp>.mp4,
 * 영상 업로드 경로는 crypto.randomBytes(6)의 12자리 hex와 허용 확장자를 쓴다.
 * UUID.mp4는 자막 굽기 전 구버전 결과와 인트로·아웃트로 합성 결과가 함께 쓰므로 원본으로
 * 낙관하지 않는다.
 */
export function isKnownUnbakedVideoFilename(filename: string): boolean {
  return HIGGSFIELD_ORIGINAL_PATTERN.test(filename) || UPLOADED_ORIGINAL_PATTERN.test(filename);
}

export function readSubtitleBakeLineage(tenantId: string, filename: string): SubtitleBakeLineage {
  const registry = readJson<SubtitleBakeRegistry>(registryPath(tenantId));
  const record = registry?.version === 1 ? registry.outputs?.[filename] : undefined;
  if (record?.sourceFilename) return { state: "baked", sourceFilename: record.sourceFilename };

  // 2026-10-05 이후 굽기 결과는 레지스트리가 유실돼도 파일명만으로 fail-closed 한다.
  if (isSubtitleBakeOutputFilename(filename)) return { state: "baked" };
  // 생성기·업로드 경로가 실제로 부여하는 원본 이름은 구운 UUID 산출물과 구별된다.
  // 이 둘까지 unknown으로 닫으면 정상 원본의 DOM 자막과 무료 재굽기를 막아 유료 재생성을
  // 유도한다. 우리가 발급한 두 규칙만 좁게 원본으로 복구한다.
  if (isKnownUnbakedVideoFilename(filename)) return { state: "unbaked" };
  return { state: "unknown" };
}

export async function recordSubtitleBake(input: {
  tenantId: string;
  outputFilename: string;
  sourceFilename: string;
}): Promise<void> {
  await mutateJson<SubtitleBakeRegistry>(registryPath(input.tenantId), (current) => {
    const outputs = current?.version === 1 && current.outputs ? { ...current.outputs } : {};
    outputs[input.outputFilename] = {
      sourceFilename: input.sourceFilename,
      createdAt: new Date().toISOString(),
    };
    const trimmed = Object.fromEntries(
      Object.entries(outputs)
        .sort(([, left], [, right]) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, MAX_RECORDS),
    );
    return { version: 1, outputs: trimmed };
  }, EMPTY_REGISTRY);
}
