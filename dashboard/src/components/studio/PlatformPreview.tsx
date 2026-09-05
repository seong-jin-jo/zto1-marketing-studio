"use client";

import { useState } from "react";
import {
  PLATFORM_FIELD_CONTRACT,
  validatePlatformPublish,
  type PlatformPublishValidation,
} from "@/lib/studio/platform-publish-fields";

export interface PreviewText {
  threads?: string; facebook?: string; x?: string;
  instagram?: { caption?: string; hashtags?: string[]; slides?: string[] };
  shorts?: { hook?: string; body?: string; cta?: string };
}
export interface PreviewMedia { imgUrl?: string; vidUrl?: string }
export type PreviewPlatform = "threads" | "x" | "instagram" | "facebook" | "shorts" | "reels" | "tiktok";

export type PreviewAccount = {
  status: "loading" | "connected" | "missing" | "error" | "unsupported";
  displayName?: string;
  username?: string;
};

export interface PreviewInlineEditor {
  account: PreviewAccount;
  title: string;
  caption: string;
  hashtags: string;
  topicTag: string;
  firstComment: string;
  firstCommentSupported: boolean;
  firstCommentReason?: string;
  onTitleChange: (value: string) => void;
  onCaptionChange: (value: string) => void;
  onHashtagsChange: (value: string) => void;
  onTopicTagChange: (value: string) => void;
  onFirstCommentChange: (value: string) => void;
}

export const PREVIEW_PLATFORMS: { key: PreviewPlatform; label: string }[] = [
  { key: "threads", label: "Threads" }, { key: "x", label: "X" },
  { key: "instagram", label: "Instagram" }, { key: "facebook", label: "Facebook" },
  { key: "shorts", label: "Shorts" }, { key: "reels", label: "Reels" }, { key: "tiktok", label: "TikTok" },
];

// 모든 플랫폼 미리보기 가로폭 통일. 높이는 콘텐츠와 비율대로 두어 잘림을 막는다.
export function Logo({ p }: { p: PreviewPlatform }) {
  const c = "w-5 h-5 text-accent";
  if (p === "threads") return <svg className={c} viewBox="0 0 192 192" fill="currentColor"><path d="M141.5 89a66 66 0 00-2.5-1.1c-1.5-27.3-16.4-42.9-41.5-43.1h-.4c-15 0-27.7 6.5-35.2 18l12.6 8.7c5.6-8.4 14.4-11.2 22.6-11.2h.3c8.7.1 15.3 2.6 19.6 7.5 3.1 3.6 5.2 8.6 6.2 14.9a84 84 0 00-24.5-2.3c-28 1.6-46 17.2-44.8 38.8.6 11.1 6.3 20.6 16.1 26.8 8.2 5.3 18.9 7.9 29.9 7.3 14.6-.8 26-6.4 34-16.7 6-7.8 9.9-17.8 11.7-30.2 7.1 4.3 12.3 9.9 15.3 16.7 5 11.6 5.3 30.7-10.4 46.5-13.8 13.8-30.5 19.8-52.5 20-24.4-.2-42.9-8-54.8-23.2C39.3 152.6 32.9 132.4 32.7 108c.2-24.4 6.6-44.6 19.2-60.1C63.8 32.6 82.2 24.8 106.7 24.6c24.6.2 43.3 8 55.6 23.3 6 7.5 10.6 16.6 13.6 27.3l14.9-3.9c-3.5-12.5-9-23.4-16.2-32.4C159.4 20.3 137.1 10.8 106.7 10.6h-.1C76.3 10.8 54.3 20.3 39.5 39.1 23.5 59.5 15.4 86.8 15.1 108v.3c.2 21.2 8.3 48.5 24.4 68.9 14.8 18.8 36.8 28.3 67.1 28.5h.1c26-.2 46.6-8.1 63.3-24.2 22.1-21.4 21.5-47.6 14.6-63.4-5-11.4-14.5-20.5-27.1-26.1z"/></svg>;
  if (p === "x") return <svg className={c} viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 1.2h3.7l-8 9.1L24 22.8h-7.4l-5.8-7.6-6.6 7.6H.5l8.6-9.8L0 1.2h7.6l5.2 6.9zM17.6 20.6h2L6.5 3.3H4.3z"/></svg>;
  if (p === "facebook") return <svg className={c} viewBox="0 0 24 24" fill="currentColor"><path d="M24 12a12 12 0 10-13.9 11.9v-8.4H7v-3.5h3.1V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9v2.2h3.4l-.5 3.5h-2.9v8.4A12 12 0 0024 12z"/></svg>;
  if (p === "instagram") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="6"/><circle cx="12" cy="12" r="4.5"/><circle cx="17.5" cy="6.5" r="1.3" fill="currentColor" stroke="none"/></svg>;
  if (p === "shorts") return <svg className={c} viewBox="0 0 24 24"><rect x="6" y="2" width="12" height="20" rx="5" fill="currentColor"/><path d="M10 8.5l5 3.5-5 3.5z" fill="var(--accent-fg)"/></svg>;
  if (p === "reels") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="5"/><path d="M3 8h18M8 3l2 5M13 3l2 5"/><path d="M10 11.5l4 2.5-4 2.5z" fill="currentColor" stroke="none"/></svg>;
  return <svg className={c} viewBox="0 0 24 24" fill="currentColor"><path d="M16 3c.3 2.3 1.8 4.1 4 4.4v3c-1.5 0-2.9-.4-4.1-1.2v6.1a5.7 5.7 0 11-5.7-5.7c.3 0 .6 0 .9.1v3.1a2.7 2.7 0 102 2.6V3z"/></svg>;
}

function Frame({ p, label, children, headerRight, characterCount }: {
  p: PreviewPlatform;
  label: string;
  children: React.ReactNode;
  headerRight?: React.ReactNode;
  characterCount?: { current: number; limit: number };
}) {
  return (
    <div className="w-full max-w-sm">
      {/*
        2026-09-05 회장 계정 실측(폭 430): 이 머리줄이 담긴 칸보다 18픽셀 넓어져 오른쪽
        끝의 발행 토글과 계정 관리가 잘렸다. 문서 가로 스크롤은 0이라 겉으로는 멀쩡해
        보이지만 조작할 수 없는 단추가 생긴다. 좁으면 줄을 바꾸게 한다.
      */}
      <div className="flex flex-wrap items-center gap-stack-tight mb-stack-tight px-micro">
        <Logo p={p} />
        <span className="shrink-0 whitespace-nowrap text-caption font-bold text-muted">{label}</span>
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-stack-tight">
          {characterCount && (
            <span
              data-testid={`character-count-${p}`}
              className={`text-caption ${characterCount.current > characterCount.limit ? "text-danger" : "text-subtle"}`}
            >
              {characterCount.current}/{characterCount.limit}
            </span>
          )}
          {headerRight}
        </div>
      </div>
      {children}
    </div>
  );
}

function AccountIdentity({ platform, account }: { platform: PreviewPlatform; account: PreviewAccount }) {
  const statusLabel = account.status === "loading"
    ? "연결 계정 확인 중"
    : account.status === "error"
      ? "연결 계정을 확인하지 못했습니다"
      : account.status === "unsupported"
        ? "이 플랫폼 발행은 아직 지원하지 않습니다"
        : "연결된 계정이 없습니다";
  if (account.status !== "connected") {
    return <div data-testid={`preview-account-${platform}`} data-account-state={account.status} className="rounded-control border border-border bg-surface-2 p-stack text-caption text-muted">{statusLabel}</div>;
  }
  return (
    <div data-testid={`preview-account-${platform}`} data-account-state="connected" className="flex min-h-control-touch items-center gap-stack rounded-control border border-border bg-surface-2 p-stack">
      <Av s={32} />
      <div className="min-w-0 flex-1"><b className="block truncate text-body-sm text-text">{account.displayName || account.username || "연결 계정"}</b>{account.username ? <span className="block truncate text-caption text-subtle">@{account.username.replace(/^@/, "")}</span> : null}</div>
      <span className="text-caption text-subtle">읽기 전용</span>
    </div>
  );
}

function Counter({ validation, field }: { validation: PlatformPublishValidation; field: "title" | "body" | "topicTag" }) {
  const counter = validation.counters[field];
  if (!counter) return null;
  const invalid = counter.current > counter.limit;
  return <span className={invalid ? "text-caption text-danger" : "text-caption text-subtle"}>{counter.current}/{counter.limit} {counter.unit}</span>;
}

function InlinePreviewEditor({ platform, editor }: { platform: PreviewPlatform; editor: PreviewInlineEditor }) {
  const contract = PLATFORM_FIELD_CONTRACT[platform];
  const validation = validatePlatformPublish(platform, {
    title: editor.title,
    body: editor.caption,
    hashtags: editor.hashtags,
    topicTag: editor.topicTag,
  });
  const loading = editor.account.status === "loading";
  const inlineClass = "mt-micro min-h-control-touch w-full rounded-control border border-transparent bg-transparent px-stack text-body text-text underline decoration-accent/40 underline-offset-4 focus:border-accent focus:bg-surface focus:no-underline";
  return (
    <div className="mt-stack border-t border-border pt-stack" data-testid={`inline-editor-${platform}`} data-pub-fields={platform}>
      <AccountIdentity platform={platform} account={editor.account} />
      <div className="mt-stack grid gap-stack sm:grid-cols-2">
        {contract.title ? (
          <label className="text-caption text-muted">
            <span className="flex items-center justify-between gap-stack-tight">제목 <Counter validation={validation} field="title" /></span>
            <input
              aria-label={`${platform} 제목`}
              data-pv-inline-edit={`${platform}:title`}
              value={editor.title}
              onChange={(event) => editor.onTitleChange(event.target.value)}
              disabled={loading}
              className={inlineClass}
            />
          </label>
        ) : null}
      </div>
      <label className="mt-stack block text-caption text-muted">
        <span className="flex items-center justify-between gap-stack-tight">{contract.bodyLabel} <Counter validation={validation} field="body" /></span>
        <textarea
          aria-label={`${platform} 캡션`}
          data-pv-inline-edit={`${platform}:caption`}
          value={editor.caption}
          onChange={(event) => editor.onCaptionChange(event.target.value)}
          disabled={loading}
          rows={3}
          className={`${inlineClass} p-stack`}
        />
      </label>
      {contract.hashtags ? <label className="mt-stack block text-caption text-muted">
        해시태그
        <input
          aria-label={`${platform} 해시태그`}
          data-pv-inline-edit={`${platform}:hashtags`}
          value={editor.hashtags}
          onChange={(event) => editor.onHashtagsChange(event.target.value)}
          disabled={loading}
          className={inlineClass}
        />
      </label> : null}
      {contract.topicTag ? <label className="mt-stack block text-caption text-muted">
        <span className="flex items-center justify-between gap-stack-tight">주제 태그 <Counter validation={validation} field="topicTag" /></span>
        <input aria-label={`${platform} 주제 태그`} data-pv-inline-edit={`${platform}:topicTag`} value={editor.topicTag} onChange={(event) => editor.onTopicTagChange(event.target.value)} disabled={loading} className={inlineClass} />
      </label> : null}
      {contract.firstComment && editor.firstCommentSupported ? (
        <label className="mt-stack block text-caption text-muted">
          첫 댓글
          <textarea
            aria-label={`${platform} 첫 댓글`}
            data-pv-inline-edit={`${platform}:firstComment`}
            value={editor.firstComment}
            onChange={(event) => editor.onFirstCommentChange(event.target.value)}
            disabled={loading}
            rows={2}
            className={`${inlineClass} p-stack`}
          />
        </label>
      ) : contract.firstComment ? (
        <div className="mt-stack rounded-control border border-border bg-surface-2 p-stack text-caption text-subtle">
          첫 댓글 미지원: {editor.firstCommentReason || "현재 채널 어댑터가 지원하지 않습니다"}
        </div>
      ) : null}
      {contract.unknownLimitLabel ? <p className="mt-stack text-caption text-subtle">{contract.unknownLimitLabel}</p> : null}
      {validation.blocking.map((issue) => <p key={`${issue.field}-${issue.message}`} className="mt-stack text-caption text-danger" role="alert">{issue.message}</p>)}
      {validation.warnings.map((issue) => <p key={`${issue.field}-${issue.message}`} className="mt-stack text-caption text-warning">{issue.message}</p>)}
    </div>
  );
}

function Av({ s = 40 }: { s?: 32 | 36 | 40 }) {
  const size = s === 32 ? "h-8 w-8" : s === 36 ? "h-9 w-9" : "h-10 w-10";
  return <div className={`${size} rounded-pill shrink-0 bg-accent`} />;
}
const P = (d: string, f = false) => <svg className="w-[18px] h-[18px]" fill={f ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d={d} /></svg>;
const I = {
  heart: "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z",
  chat: "M7.5 8.25h9m-9 3H12m8.25 1.5a8.25 8.25 0 11-3.31-6.6L21 4.5v6.75h-6.75",
  repost: "M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5M16.5 3L21 7.5m0 0L16.5 12M21 7.5H7.5",
  send: "M6 12L3.27 3.27a.5.5 0 01.7-.6l16.5 8.25a.5.5 0 010 .9L3.97 20.07a.5.5 0 01-.7-.6L6 12zm0 0h6",
  share: "M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314",
  bookmark: "M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z",
  more: "M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z",
};

function IgCarousel({ cards }: { cards: { type: "img" | "text"; v: string }[] }) {
  const [i, setI] = useState(0);
  const n = cards.length; const cur = cards[i];
  return (
    <div className="relative bg-surface aspect-square">
      {n === 0 ? <div className="w-full h-full grid place-items-center text-subtle text-body-sm">카드 생성 대기</div>
        : cur.type === "img" ? <img src={cur.v} alt="" className="w-full h-full object-cover" />
        : <div className="w-full h-full grid place-items-center p-region bg-accent-soft"><p className="text-accent text-subheading font-bold text-center leading-snug">{cur.v}</p></div>}
      {n > 1 && <>
        <button type="button" aria-label="이전 카드" onClick={(e) => { e.stopPropagation(); setI((x) => (x - 1 + n) % n); }} className="absolute left-stack-tight top-1/2 min-h-control-touch min-w-control-touch -translate-y-1/2 rounded-pill bg-text text-bg">‹</button>
        <button type="button" aria-label="다음 카드" onClick={(e) => { e.stopPropagation(); setI((x) => (x + 1) % n); }} className="absolute right-stack-tight top-1/2 min-h-control-touch min-w-control-touch -translate-y-1/2 rounded-pill bg-text text-bg">›</button>
        <span className="absolute top-3 right-3 text-caption text-text bg-player-surface/50 px-stack-tight py-micro rounded-pill">{i + 1}/{n}</span>
        <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-stack-tight">{cards.map((_, k) => <span key={k} className={`w-1.5 h-1.5 rounded-pill ${k === i ? "bg-accent" : "bg-surface/50"}`} />)}</div>
      </>}
    </div>
  );
}

function VideoRail({ kind }: { kind: "shorts" | "reels" | "tiktok" }) {
  return (
    <div className="absolute right-2 bottom-24 flex flex-col items-center gap-pad-inset text-text drop-shadow z-10">
      {kind === "tiktok" && <div className="relative mb-micro"><Av s={36} /><span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-4 h-4 rounded-pill bg-danger text-bg grid place-items-center text-caption">+</span></div>}
      <div className="flex flex-col items-center">{P(I.heart, true)}<span className="text-caption mt-micro">12.4K</span></div>
      <div className="flex flex-col items-center">{P(I.chat)}<span className="text-caption mt-micro">318</span></div>
      {kind === "tiktok" ? <div className="flex flex-col items-center">{P(I.bookmark)}<span className="text-caption mt-micro">1.2K</span></div>
        : <div className="flex flex-col items-center">{P(I.send)}<span className="text-caption mt-micro">공유</span></div>}
    </div>
  );
}

export function PlatformPreview({ platform, text, media, headerRight, editor }: { platform: PreviewPlatform; text: PreviewText; media: PreviewMedia; headerRight?: React.ReactNode; editor?: PreviewInlineEditor }) {
  const handle = (editor?.account.username || editor?.account.displayName || "연결 계정 없음").replace(/^@/, "");
  const img = media.imgUrl; const vid = media.vidUrl;
  const label = PREVIEW_PLATFORMS.find((x) => x.key === platform)?.label || platform;
  const previewBody = platform === "threads"
    ? text.threads || ""
    : platform === "facebook"
      ? text.facebook || ""
      : platform === "x"
        ? text.x || ""
        : platform === "instagram"
          ? text.instagram?.caption || ""
          : "";
  const validation = editor ? validatePlatformPublish(platform, { title: editor.title, body: editor.caption, hashtags: editor.hashtags, topicTag: editor.topicTag }) : null;
  const bodyCounter = validation?.counters.body;
  const characterCount = bodyCounter ? { current: bodyCounter.current, limit: bodyCounter.limit } : undefined;

  if (platform === "threads") return (
    <Frame p="threads" label="Threads" headerRight={headerRight} characterCount={characterCount}>
      <div className="bg-surface text-text rounded-surface border border-border px-pad-inset py-stack">
        <div className="flex gap-stack"><Av />
          <div className="flex-1 min-w-0">
            <div className="flex min-w-0 items-center gap-micro text-body"><b className="min-w-0 truncate">{handle}</b><span className="shrink-0 text-subtle text-body-sm ml-micro">1시간</span><div className="ml-auto text-subtle">{P(I.more)}</div></div>
            <p className="text-body whitespace-pre-wrap leading-[1.45] mt-micro">{text.threads || <span className="text-subtle">텍스트…</span>}</p>
            {img && <img src={img} alt="" className="mt-stack-tight rounded-surface border border-border w-full max-h-80 object-cover" />}
            <div className="flex gap-stack-section mt-stack">{P(I.heart)}{P(I.chat)}{P(I.repost)}{P(I.send)}</div>
            <div className="text-subtle text-body-sm mt-stack-tight">답글 18개 · 좋아요 124개</div>
          </div></div>
      </div>
      {editor ? <InlinePreviewEditor platform="threads" editor={editor} /> : null}
    </Frame>
  );
  if (platform === "x") return (
    <Frame p="x" label="X" headerRight={headerRight} characterCount={characterCount}>
      <div className="bg-surface text-text rounded-surface border border-border px-pad-inset py-stack">
        <div className="flex gap-stack"><Av />
          <div className="flex-1 min-w-0">
            <div className="flex min-w-0 items-center gap-micro text-body"><b className="min-w-0 truncate">{handle}</b><span className="min-w-0 truncate text-subtle ml-micro">@{handle} · 1분</span><div className="ml-auto text-subtle">{P(I.more)}</div></div>
            <p className="text-body whitespace-pre-wrap leading-[1.4] mt-micro">{text.x || <span className="text-subtle">텍스트…</span>}</p>
            {img && <img src={img} alt="" className="mt-stack-tight rounded-surface border border-border w-full max-h-80 object-cover" />}
            <div className="flex justify-between mt-stack text-subtle text-body-sm">
              <span className="flex items-center gap-stack-tight">{P(I.chat)}24</span><span className="flex items-center gap-stack-tight">{P(I.repost)}57</span>
              <span className="flex items-center gap-stack-tight">{P(I.heart)}312</span><span className="flex items-center gap-stack-tight">{P(I.bookmark)}</span><span className="flex items-center gap-stack-tight">{P(I.share)}</span>
            </div></div></div>
      </div>
      {editor ? <InlinePreviewEditor platform="x" editor={editor} /> : null}
    </Frame>
  );
  if (platform === "facebook") return (
    <Frame p="facebook" label="Facebook" headerRight={headerRight} characterCount={characterCount}>
      <div className="bg-surface text-text rounded-control border border-border overflow-hidden">
        <div className="flex items-center gap-stack-tight px-stack pt-stack"><Av /><div className="min-w-0"><div className="truncate font-semibold text-body leading-tight">{handle}</div><div className="text-subtle text-caption">방금 · 전체 공개</div></div><div className="ml-auto text-subtle">{P(I.more)}</div></div>
        <p className="px-stack py-stack-tight text-body whitespace-pre-wrap leading-snug">{text.facebook || <span className="text-subtle">텍스트…</span>}</p>
        {img && <img src={img} alt="" className="w-full max-h-80 object-cover" />}
        <div className="flex items-center justify-between px-stack py-stack-tight text-subtle text-body-sm border-b border-border"><span>반응 248</span><span>댓글 32 · 공유 12</span></div>
        <div className="flex text-subtle text-body-sm font-medium">{["좋아요", "댓글", "공유"].map((l) => <div key={l} className="flex-1 text-center py-stack-tight hover:bg-surface-2">{l}</div>)}</div>
      </div>
      {editor ? <InlinePreviewEditor platform="facebook" editor={editor} /> : null}
    </Frame>
  );
  if (platform === "instagram") {
    const cards = [...(img ? [{ type: "img" as const, v: img }] : []), ...(text.instagram?.slides || []).map((s) => ({ type: "text" as const, v: s }))];
    return (
      <Frame p="instagram" label="Instagram" headerRight={headerRight} characterCount={characterCount}>
        <div className="bg-surface text-text rounded-control border border-border overflow-hidden">
          <div className="flex items-center gap-stack px-stack py-stack"><Av s={32} /><b className="min-w-0 truncate text-body-sm">{handle}</b><span className="shrink-0 text-subtle text-caption">· 팔로우</span><div className="ml-auto text-subtle">{P(I.more)}</div></div>
          <IgCarousel cards={cards} />
          <div className="flex items-center gap-pad-inset px-stack pt-stack">{P(I.heart)}{P(I.chat)}{P(I.send)}<div className="ml-auto">{P(I.bookmark)}</div></div>
          <div className="px-stack pt-stack-tight text-body-sm font-semibold">좋아요 1,284개</div>
          <div className="px-stack pt-micro pb-stack text-body-sm"><b className="break-all">{handle}</b> <span className="text-muted">{text.instagram?.caption}</span>
            <div className="text-accent mt-micro">{(text.instagram?.hashtags || []).map((h) => `#${h.replace(/^#/, "")}`).join(" ")}</div></div>
        </div>
        {editor ? <InlinePreviewEditor platform="instagram" editor={editor} /> : null}
      </Frame>
    );
  }
  // 세로영상
  const k = platform as "shorts" | "reels" | "tiktok";
  const cap = editor?.caption || text.shorts?.hook || text.instagram?.caption || "";
  return (
    <Frame p={platform} label={label} headerRight={headerRight}>
      <div className="relative rounded-surface overflow-hidden bg-surface-2 aspect-[9/16] border border-border">
        {vid ? <video key={vid} src={vid} controls playsInline preload="metadata" className="w-full h-full object-cover" />
          : img ? <img src={img} alt="" className="w-full h-full object-cover" />
          : <div className="w-full h-full grid place-items-center text-subtle text-caption">영상 생성 대기</div>}
        {!vid && <>
          {k === "shorts" && <div className="absolute top-3 left-3 flex items-center gap-micro text-text font-bold text-body-sm">▶ Shorts</div>}
          {k === "reels" && <div className="absolute top-3 left-3 right-3 flex justify-between text-text text-body-sm"><span>이전</span><b>릴스</b><span>카메라</span></div>}
          {k === "tiktok" && <div className="absolute top-3 left-0 right-0 flex justify-center gap-pad-inset text-text/80 text-body-sm"><span>팔로잉</span><b className="text-text border-b-2 border-player-text pb-micro">추천</b></div>}
          <VideoRail kind={k} />
          <div className="absolute left-3 right-12 bottom-3 text-text">
            <div className="truncate text-body-sm font-bold">@{handle}</div>
            {editor?.title ? <div className="mt-micro text-body-sm font-semibold">{editor.title}</div> : null}
            <div className="text-caption leading-snug line-clamp-2 opacity-95">{cap}</div>
            {editor?.hashtags ? <div className="mt-micro line-clamp-1 text-caption opacity-90">{editor.hashtags}</div> : null}
            {k === "tiktok" && <div className="text-caption mt-micro opacity-90">원본 사운드 · {handle}</div>}
          </div>
        </>}
      </div>
      {editor ? <InlinePreviewEditor platform={platform} editor={editor} /> : null}
    </Frame>
  );
}
