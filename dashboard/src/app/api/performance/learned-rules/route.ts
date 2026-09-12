import { createHash } from "node:crypto";
import { readJson, mutateJson, dataPath } from "@/lib/file-io";
import { effectiveTenantId } from "@/lib/tenant-auth";
import { runWithTenant } from "@/lib/tenant-context";

// 성과실 챗봇 L5. "이거 왜 잘 됐어" → 규칙 후보 → 고객 승낙 → 여기 저장.
// docs/_archive/legacy-20260912/design-docs/osmu-4room-구조질문-선택지-v1.0.0-opus-20260829.md 질문3 "성과실 챗봇"의 마지막 줄
// (성과가 학습 정보로 되돌아가는 승낙은 대화가 아니면 자연스럽게 못 만든다) 구현.
// 어디서 왔는지 추적 가능하게 sourcePostIds·sourceLabel을 같이 저장한다(성과실 화면이 이걸 보여줘야 함).

export interface LearnedRule {
  id: string;
  text: string;
  sourcePostIds: string[];
  sourceLabel: string;
  createdAt: string;
  active: boolean;
}

export interface LearnedRuleDecision {
  id: string;
  candidateId: string;
  decision: "accepted" | "rejected";
  text: string;
  sourcePostIds: string[];
  sourceLabel: string;
  sampleCount: number;
  observedFrom: string | null;
  observedTo: string | null;
  scope: "workspace_generation";
  decidedAt: string;
  ruleId: string | null;
}

interface RulesFile {
  rules: LearnedRule[];
  decisions?: LearnedRuleDecision[];
}

const FILE_NAME = "performance-learned-rules.json";

export async function GET(request: Request) {
  const tenantId = await effectiveTenantId(request, new URL(request.url).searchParams.get("tenant_id"));
  if (!tenantId) return Response.json({ rules: [] });
  return runWithTenant(tenantId, async () => {
    const data = readJson<RulesFile>(dataPath(FILE_NAME)) || { rules: [] };
    return Response.json({
      rules: (data.rules || []).filter((rule) => rule.active !== false),
      decisions: [...(data.decisions || [])].reverse().slice(0, 50),
    });
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const tenantId = await effectiveTenantId(request, body.tenant_id ?? null);
  if (!tenantId) return Response.json({ error: "tenant_id required" }, { status: 400 });
  const text = String(body.text || "").trim();
  if (!text) return Response.json({ error: "text required" }, { status: 400 });
  const decision = body.decision == null ? "accepted" : String(body.decision);
  if (decision !== "accepted" && decision !== "rejected") {
    return Response.json({ error: "decision must be accepted or rejected", code: "INVALID_DECISION" }, { status: 400 });
  }
  const sourcePostIds: string[] = Array.isArray(body.sourcePostIds)
    ? [...new Set<string>(body.sourcePostIds.map((value: unknown) => String(value)).filter((value: string) => Boolean(value)))].slice(0, 10)
    : [];
  const sampleCount = body.sampleCount == null ? sourcePostIds.length : Number(body.sampleCount);
  if (!Number.isInteger(sampleCount) || sampleCount < 0) {
    return Response.json({ error: "sampleCount must be a non-negative integer", code: "INVALID_SAMPLE_COUNT" }, { status: 400 });
  }
  const observedFrom = body.observedFrom == null ? null : String(body.observedFrom);
  const observedTo = body.observedTo == null ? null : String(body.observedTo);
  if (
    (observedFrom !== null && !Number.isFinite(Date.parse(observedFrom)))
    || (observedTo !== null && !Number.isFinite(Date.parse(observedTo)))
    || (observedFrom !== null && observedTo !== null && Date.parse(observedFrom) > Date.parse(observedTo))
  ) {
    return Response.json({ error: "observation period is invalid", code: "INVALID_OBSERVATION_PERIOD" }, { status: 400 });
  }
  const candidateId = String(body.candidateId || "").trim() || `candidate_${createHash("sha256")
    .update(JSON.stringify([text, [...sourcePostIds].sort(), observedFrom, observedTo]))
    .digest("hex")
    .slice(0, 16)}`;

  return runWithTenant(tenantId, async () => {
    let recordedDecision: LearnedRuleDecision | null = null;
    let recordedRule: LearnedRule | null = null;
    let reused = false;
    let conflict = false;

    await mutateJson<RulesFile>(dataPath(FILE_NAME), (current) => {
      const rules = current.rules || [];
      const decisions = current.decisions || [];
      const existing = decisions.find((item) => item.candidateId === candidateId);
      if (existing) {
        if (existing.decision !== decision) {
          conflict = true;
          return { rules, decisions };
        }
        recordedDecision = existing;
        recordedRule = existing.ruleId ? rules.find((rule) => rule.id === existing.ruleId) || null : null;
        reused = true;
        return { rules, decisions };
      }

      const decidedAt = new Date().toISOString();
      const nextRule: LearnedRule | null = decision === "accepted"
        ? {
            id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            text,
            sourcePostIds,
            sourceLabel: String(body.sourceLabel || "성과실 담당과 대화 중 승낙"),
            createdAt: decidedAt,
            active: true,
          }
        : null;
      const nextDecision: LearnedRuleDecision = {
        id: `decision_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        candidateId,
        decision,
        text,
        sourcePostIds,
        sourceLabel: String(body.sourceLabel || "성과실 담당과 대화 중 판단"),
        sampleCount,
        observedFrom,
        observedTo,
        scope: "workspace_generation",
        decidedAt,
        ruleId: nextRule?.id || null,
      };
      recordedRule = nextRule;
      recordedDecision = nextDecision;
      return {
        rules: nextRule ? [...rules, nextRule] : rules,
        decisions: [...decisions, nextDecision],
      };
    }, { rules: [], decisions: [] });

    if (conflict) {
      return Response.json({ error: "candidate decision already recorded", code: "DECISION_ALREADY_RECORDED" }, { status: 409 });
    }
    return Response.json({ ok: true, reused, decision: recordedDecision, rule: recordedRule }, { status: reused ? 200 : 201 });
  });
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const tenantId = await effectiveTenantId(request, url.searchParams.get("tenant_id"));
  const id = url.searchParams.get("id");
  if (!tenantId || !id) return Response.json({ error: "tenant_id, id required" }, { status: 400 });
  return runWithTenant(tenantId, async () => {
    await mutateJson<RulesFile>(dataPath(FILE_NAME), (data) => ({
      rules: (data.rules || []).map((rule) => (rule.id === id ? { ...rule, active: false } : rule)),
      decisions: data.decisions || [],
    }), { rules: [], decisions: [] });
    return Response.json({ ok: true });
  });
}
