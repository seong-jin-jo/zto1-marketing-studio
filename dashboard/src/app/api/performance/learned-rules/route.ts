import { candidateFingerprint } from "@/lib/performance/candidate-fingerprint";
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
  /**
   * 서버가 계산하는 정규 후보 지문. 유일성은 이 값에 건다.
   * 화면이 만드는 candidateId 는 탭마다 무작위라 같은 후보를 두 탭에서 만들면
   * 중복·반대 판단 방지가 통째로 우회됐다(2026-09-12 감사 MAJOR).
   * 지문은 규칙 문장, 정렬한 출처 글 id, 관찰 기간만으로 만든다.
   */
  candidateKey?: string;
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

/**
 * 옛 기록에는 지문이 없다. 그때는 저장된 값으로 지문을 다시 계산해 견준다.
 * candidateId 로만 견주면 옛 기록이 있는 작업 공간에서 무작위 id 우회가 되살아난다(Codex 교차 리뷰 MAJOR 1).
 */
function sameCandidate(item: LearnedRuleDecision, candidateKey: string, candidateId: string): boolean {
  if (item.candidateKey) return item.candidateKey === candidateKey;
  if (item.candidateId === candidateId) return true;
  return candidateFingerprint({
    text: String(item.text || ""),
    sourcePostIds: (item.sourcePostIds || []).map((value) => String(value).trim()),
    observedFrom: normalizeInstant(item.observedFrom),
    observedTo: normalizeInstant(item.observedTo),
  }) === candidateKey;
}

/** 같은 시각을 다른 문자열로 보내도 같은 후보가 되게 한다(Codex 교차 리뷰 MAJOR 2). */
function normalizeInstant(value: string | null): string | null {
  if (value == null) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : value;
}

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
    ? [...new Set<string>(body.sourcePostIds.map((value: unknown) => String(value).trim()).filter((value: string) => Boolean(value)))].slice(0, 10)
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
  const candidateKey = candidateFingerprint({
    text,
    sourcePostIds,
    observedFrom: normalizeInstant(observedFrom),
    observedTo: normalizeInstant(observedTo),
  });
  const candidateId = String(body.candidateId || "").trim() || `candidate_${candidateKey.slice(0, 16)}`;

  return runWithTenant(tenantId, async () => {
    let recordedDecision: LearnedRuleDecision | null = null;
    let recordedRule: LearnedRule | null = null;
    let reused = false;
    let conflict = false;

    await mutateJson<RulesFile>(dataPath(FILE_NAME), (current) => {
      const rules = current.rules || [];
      const decisions = current.decisions || [];
      const existing = decisions.find((item) => sameCandidate(item, candidateKey, candidateId));
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
        candidateKey,
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
  const decisionId = url.searchParams.get("decisionId");
  if (!tenantId || (!id && !decisionId) || (id && decisionId)) {
    return Response.json({ error: "tenant_id and exactly one of id or decisionId required" }, { status: 400 });
  }
  return runWithTenant(tenantId, async () => {
    // 되돌리기. 판단 이력과 그 판단이 만든 활성 규칙을 한 번의 잠금 안에서 같이 되돌린다.
    // 규칙만 끄고 이력을 남겨 두면 같은 후보의 반대 판단이 영원히 409 가 된다(2026-09-12 감사 MAJOR).
    let undone: LearnedRuleDecision | null = null;
    let deactivatedRuleId: string | null = null;
    let found = false;

    await mutateJson<RulesFile>(dataPath(FILE_NAME), (data) => {
      const rules = data.rules || [];
      const decisions = data.decisions || [];
      const target = decisionId
        ? decisions.find((item) => item.id === decisionId) || null
        : decisions.find((item) => item.ruleId === id) || null;
      const ruleId = decisionId ? target?.ruleId ?? null : id;
      const ruleExists = ruleId ? rules.some((rule) => rule.id === ruleId) : false;
      if (!target && !ruleExists) return { rules, decisions };

      found = true;
      undone = target;
      deactivatedRuleId = ruleExists ? ruleId : null;
      return {
        rules: rules.map((rule) => (ruleId && rule.id === ruleId ? { ...rule, active: false } : rule)),
        decisions: target ? decisions.filter((item) => item.id !== target.id) : decisions,
      };
    }, { rules: [], decisions: [] });

    if (!found) {
      return Response.json({ error: "decision or rule not found", code: "NOT_FOUND" }, { status: 404 });
    }
    return Response.json({ ok: true, undone, deactivatedRuleId });
  });
}
