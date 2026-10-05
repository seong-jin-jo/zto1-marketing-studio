import path from "node:path";
import { mutateJson, readJson } from "@/lib/file-io";
import { studioDir } from "@/lib/higgsfield";

export type SubtitleBakeLineage =
  | { state: "baked"; sourceFilename?: string }
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

function registryPath(tenantId: string): string {
  return path.join(studioDir(tenantId), REGISTRY_FILENAME);
}

export function subtitleBakeOutputFilename(randomFilename: string): string {
  return `subtitle-${randomFilename}`;
}

export function isSubtitleBakeOutputFilename(filename: string): boolean {
  return SUBTITLE_OUTPUT_PATTERN.test(filename);
}

export function readSubtitleBakeLineage(tenantId: string, filename: string): SubtitleBakeLineage {
  const registry = readJson<SubtitleBakeRegistry>(registryPath(tenantId));
  const record = registry?.version === 1 ? registry.outputs?.[filename] : undefined;
  if (record?.sourceFilename) return { state: "baked", sourceFilename: record.sourceFilename };

  // 2026-10-05 이후 굽기 결과는 레지스트리가 유실돼도 파일명만으로 fail-closed 한다.
  // 그 이전 결과는 원본과 똑같은 UUID.ext 규칙을 써 구분할 수 없으므로 추측하지 않는다.
  if (isSubtitleBakeOutputFilename(filename)) return { state: "baked" };
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
