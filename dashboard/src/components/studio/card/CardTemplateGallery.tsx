"use client";

import { Button } from "@/components/shared/Button";
import {
  CARD_DECK_TEMPLATES,
  cardTemplateName,
  type CardDeckTemplateId,
} from "@/lib/studio/card-templates";
import type { CardDeckV3 } from "@/lib/studio/card-element-contract";
import { cardDeckV3Projection } from "@/lib/studio/card-element-contract";
import { DeliveredMedia } from "@/components/studio/DeliveredMedia";

interface BaseProps {
  selectedId: CardDeckTemplateId;
  recommendedId?: CardDeckTemplateId;
  onSelect: (id: CardDeckTemplateId) => void;
  disabledReasons?: Partial<Record<CardDeckTemplateId, string>>;
  previewImageUrl?: string | null;
  tenantId?: string;
}

type CardTemplateGalleryProps = BaseProps & ({
  mode: "create";
  structureTitle: string;
  structureFirstLine: string;
} | {
  mode: "edit";
  beforeDeck: CardDeckV3;
  afterDeck: CardDeckV3 | null;
  scope: "all" | "slide";
  canApplySlide: boolean;
  previousTemplateName?: string | null;
  onScopeChange: (scope: "all" | "slide") => void;
  onApply: () => void;
  onRestore: () => void;
});

function TemplateCard({ id, selected, recommended, title, body, disabledReason, previewImageUrl, tenantId, fitContainer = false, onSelect }: {
  id: CardDeckTemplateId;
  selected: boolean;
  recommended: boolean;
  title: string;
  body: string;
  disabledReason?: string;
  previewImageUrl?: string | null;
  tenantId?: string;
  fitContainer?: boolean;
  onSelect: () => void;
}) {
  const template = CARD_DECK_TEMPLATES.find((item) => item.id === id)!;
  return (
    <Button
      variant="secondary"
      size="sm"
      className={`${fitContainer ? "ds-label-fill min-w-0 w-full overflow-hidden" : "w-56 shrink-0"} flex-col items-stretch justify-start p-stack text-left aria-pressed:border-accent aria-pressed:bg-accent-soft`}
      aria-pressed={selected}
      aria-describedby={disabledReason ? `card-template-disabled-${id}` : undefined}
      disabled={Boolean(disabledReason)}
      onClick={onSelect}
      data-card-template={id}
    >
      <span className="mb-stack-tight block rounded-control border border-border bg-surface p-stack-tight">
        {previewImageUrl ? <DeliveredMedia type="image" src={previewImageUrl} tenantId={tenantId} alt={`${template.name} 실제 이미지 미리보기`} className="mb-stack-tight aspect-square w-full rounded-control object-cover" /> : null}
        <b className="line-clamp-2 block text-body-sm">{title || template.name}</b>
        <span className="mt-micro line-clamp-2 block text-subtle">{body || template.description}</span>
      </span>
      <b className="block">{template.name}</b>
      {disabledReason ? <span id={`card-template-disabled-${id}`} className="block whitespace-normal break-keep text-warning">{disabledReason}</span> : recommended ? <span className="text-accent">추천</span> : <span className="text-subtle">{template.family === "chat" ? "대화형" : "사진·글"}</span>}
    </Button>
  );
}

export function CardTemplateGallery(props: CardTemplateGalleryProps) {
  const beforeLines = props.mode === "edit" ? cardDeckV3Projection(props.beforeDeck).slice(0, 3) : [];
  const afterLines = props.mode === "edit" && props.afterDeck ? cardDeckV3Projection(props.afterDeck).slice(0, 3) : [];
  const title = props.mode === "create" ? props.structureTitle : beforeLines[0] ?? "현재 작업물";
  const body = props.mode === "create" ? props.structureFirstLine : beforeLines[1] ?? beforeLines[0] ?? "현재 글";

  return (
    <section className="space-y-stack rounded-surface border border-border bg-surface p-pad-inset" aria-labelledby={`card-template-title-${props.mode}`} data-card-template-gallery={props.mode}>
      <div>
        <h3 id={`card-template-title-${props.mode}`} className="text-body font-bold text-text">카드 템플릿</h3>
        <p className="text-caption text-subtle">지금 작업물의 글과 브랜드 색으로 미리 봅니다. 템플릿 선택은 무료입니다.</p>
      </div>
      <div className={props.mode === "edit" ? "grid min-w-0 grid-cols-1 gap-stack sm:grid-cols-2 xl:grid-cols-3" : "flex min-w-0 gap-stack overflow-x-auto pb-micro"} aria-label="카드 템플릿 6개">
        {CARD_DECK_TEMPLATES.map((template) => (
          <TemplateCard
            key={template.id}
            id={template.id}
            selected={props.selectedId === template.id}
            recommended={props.recommendedId === template.id}
            title={title}
            body={body}
            disabledReason={props.disabledReasons?.[template.id]}
            previewImageUrl={props.previewImageUrl}
            tenantId={props.tenantId}
            fitContainer={props.mode === "edit"}
            onSelect={() => props.onSelect(template.id)}
          />
        ))}
      </div>
      {props.mode === "create" ? (
        <p className="text-caption font-semibold text-accent">{cardTemplateName(props.recommendedId ?? props.selectedId)} 추천: 고른 구조에 가장 잘 맞습니다.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-stack-tight" role="group" aria-label="템플릿 적용 범위">
            <Button size="sm" variant={props.scope === "all" ? "primary" : "secondary"} aria-pressed={props.scope === "all"} onClick={() => props.onScopeChange("all")}>전체 바꾸기</Button>
            {props.canApplySlide ? <Button size="sm" variant={props.scope === "slide" ? "primary" : "secondary"} aria-pressed={props.scope === "slide"} onClick={() => props.onScopeChange("slide")}>이 장만 바꾸기</Button> : null}
            {!props.canApplySlide ? <span className="self-center text-caption text-subtle">대화 덱은 덱 전체로만 바꿀 수 있습니다.</span> : null}
          </div>
          {props.afterDeck ? (
            <div className="grid gap-stack md:grid-cols-2" data-template-comparison>
              <article className="rounded-control border border-border bg-surface-2 p-stack"><b className="text-caption text-subtle">바꾸기 전</b><p className="mt-stack-tight line-clamp-3 whitespace-pre-wrap text-body-sm text-text">{beforeLines.join("\n")}</p></article>
              <article className="rounded-control border border-accent bg-accent-soft p-stack"><b className="text-caption text-accent">바꾼 뒤</b><p className="mt-stack-tight line-clamp-3 whitespace-pre-wrap text-body-sm text-text">{afterLines.join("\n")}</p></article>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-stack-tight">
            <Button variant="primary" onClick={props.onApply} disabled={Boolean(props.disabledReasons?.[props.selectedId])}>이 템플릿으로 바꾸기</Button>
            {props.previousTemplateName ? <Button variant="secondary" onClick={props.onRestore}>이전 템플릿({props.previousTemplateName})으로</Button> : null}
          </div>
        </>
      )}
    </section>
  );
}
