import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { Img } from "remotion";
import { DeliveredMedia } from "@/components/studio/DeliveredMedia";
import type { Bubble } from "@/lib/studio/card-deck-contract";
import type { CardElement, TextElement } from "@/lib/studio/card-element-contract";
import { cardElementStyle, visibleCardElements, type CardSlideRenderModel } from "@/lib/studio/card-render-model";
import {
  BRAND_BUBBLE_BG,
  BUBBLE_TEXT,
  PHOTO_TEXT_PRIMARY,
  PHOTO_TEXT_SECONDARY,
  READER_BUBBLE_BG,
} from "@/lib/studio/card-templates/chat-bubble";
import styles from "./CardSlideScene.module.css";

export interface CardSlideSceneProps {
  model: CardSlideRenderModel;
  renderMode: "editor" | "export";
}

function verticalAlignment(value: TextElement["style"]["vertical_align"]): "flex-start" | "center" | "flex-end" {
  return value === "top" ? "flex-start" : value === "bottom" ? "flex-end" : "center";
}

function BuiltinAsset({ element }: { element: CardElement }) {
  if (element.type === "sticker") return <span className={styles.sticker} aria-hidden={element.decorative}>★</span>;
  if (element.type === "logo") return <span className={styles.logo}>{element.alt || "OSMU"}</span>;
  return <span className={styles.imagePlaceholder} aria-hidden="true">사진</span>;
}

function ElementContent({ element, model, renderMode }: { element: CardElement; model: CardSlideRenderModel; renderMode: CardSlideSceneProps["renderMode"] }) {
  if (element.type === "text") {
    const style = {
      "--card-text-size": `${element.style.font_size / model.logicalWidth * 100}cqw`,
      "--card-text-weight": element.style.font_weight,
      "--card-text-leading": element.style.line_height,
      "--card-text-tracking": `${element.style.letter_spacing / model.logicalWidth * 100}cqw`,
      "--card-text-color": element.style.color,
      "--card-text-align": element.style.align,
      "--card-text-vertical": verticalAlignment(element.style.vertical_align),
    } as CSSProperties;
    return <span className={styles.text} style={style}>{element.text}</span>;
  }
  if (element.type === "shape") {
    const style = {
      "--card-shape-fill": element.fill,
      "--card-shape-stroke": element.stroke,
      "--card-shape-stroke-width": `${element.stroke_width / model.logicalWidth * 100}cqw`,
      "--card-shape-radius": `${element.corner_radius / model.logicalWidth * 100}cqw`,
    } as CSSProperties;
    return <span className={styles[element.shape]} style={style} aria-hidden="true" />;
  }
  const src = model.assetUrls[element.asset_id];
  if (!src || element.asset_id.startsWith("builtin:")) return <BuiltinAsset element={element} />;
  if (renderMode === "export") return <Img className={styles.media} src={src} alt={element.alt} />;
  return <DeliveredMedia className={styles.media} src={src} type="image" alt={element.alt} draggable={false} />;
}

function BubbleText({ bubble }: { bubble: Bubble }) {
  return <>{bubble.segments.map((segment, index) => segment.bold
    ? <strong key={`${bubble.id}-${index}`}>{segment.text}</strong>
    : <span key={`${bubble.id}-${index}`}>{segment.text}</span>)}</>;
}

export function assertChatListFits(
  element: Pick<HTMLElement, "clientHeight" | "scrollHeight">,
  slideOrder: number,
): void {
  if (element.scrollHeight > element.clientHeight + 1) {
    throw new Error(`CARD_CHAT_OVERFLOW: ${slideOrder + 1}번 장 말풍선이 카드보다 깁니다. 쪼개세요.`);
  }
}

function ChatBubbleBase({ model, renderMode }: { model: CardSlideRenderModel; renderMode: CardSlideSceneProps["renderMode"] }) {
  const chatListRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (renderMode === "export" && chatListRef.current) {
      assertChatListFits(chatListRef.current, model.slide.order);
    }
  }, [model.slide.order, model.slide.base, renderMode]);
  if (model.slide.base.kind !== "chat_bubble") return null;
  const { cover, bubbles } = model.slide.base;
  const profileUrl = model.brand.profile_image_asset_id ? model.assetUrls[model.brand.profile_image_asset_id] : undefined;
  if (model.slide.role === "cover" && cover) {
    return (
      <div className={styles.chatCover} data-chat-base="cover">
        <div className={styles.chatCoverCopy}>
          <h2>{cover.headline}</h2>
          {cover.sub ? <p>{cover.sub}</p> : null}
        </div>
        <div className={styles.chatFooter}><span>{model.brand.display_name}</span><span>{model.slide.order + 1}</span></div>
      </div>
    );
  }
  const orderedBubbles = [...bubbles].sort((left, right) => left.order - right.order);
  const firstBrandBubbleId = orderedBubbles.find((bubble) => bubble.speaker === "brand")?.id;
  return (
    <div className={styles.chatBase} data-chat-base="conversation">
      <header className={styles.chatHeader}>
        <span>{model.brand.display_name}</span>
        <span>{model.slide.order + 1}</span>
      </header>
      <div ref={chatListRef} className={styles.chatList} data-chat-list>
        {orderedBubbles.map((bubble) => {
          const showBrandIdentity = bubble.id === firstBrandBubbleId;
          return (
            <div key={bubble.id} className={`${styles.chatRow} ${bubble.speaker === "reader" ? styles.readerRow : styles.brandRow}`} data-chat-bubble={bubble.id}>
              {showBrandIdentity ? <span className={styles.chatAvatar} aria-hidden="true">
                {profileUrl
                  ? renderMode === "export"
                    ? <Img className={styles.chatAvatarMedia} src={profileUrl} alt="" />
                    : <DeliveredMedia className={styles.chatAvatarMedia} src={profileUrl} type="image" alt="" />
                  : model.brand.display_name.slice(0, 2)}
              </span> : null}
              <div className={styles.chatColumn}>
                {showBrandIdentity ? <span className={styles.chatName} data-chat-speaker-name>{model.brand.display_name}</span> : null}
                <div className={styles.chatBubbleLine}>
                  <div className={styles.chatBubble}><BubbleText bubble={bubble} /></div>
                  <time className={styles.chatTime}>오후 9:20</time>
                </div>
                {bubble.reaction ? <span className={styles.chatReaction} aria-label="좋아요">♥</span> : null}
              </div>
            </div>
          );
        })}
      </div>
      <footer className={styles.chatFooter}>
        <span>{model.slide.role === "cta" ? model.brand.display_name : model.brand.handle ?? model.brand.display_name}</span>
        <span>{model.slide.order + 1}</span>
      </footer>
    </div>
  );
}

export function CardSlideScene({ model, renderMode }: CardSlideSceneProps) {
  const background = model.slide.background;
  const hasPhoto = background.kind === "image";
  const sceneStyle = {
    "--card-stage-ratio": `${model.logicalWidth} / ${model.logicalHeight}`,
    "--card-stage-background": background.kind === "solid" ? background.color : model.theme.background,
    "--card-stage-foreground": model.theme.foreground,
    "--card-stage-accent": model.theme.accent,
    "--card-chat-reader-background": READER_BUBBLE_BG,
    "--card-chat-brand-background": BRAND_BUBBLE_BG,
    "--card-chat-text": BUBBLE_TEXT,
    "--card-chat-primary-text": hasPhoto ? PHOTO_TEXT_PRIMARY : model.theme.foreground,
    "--card-chat-muted-text": hasPhoto ? PHOTO_TEXT_SECONDARY : `color-mix(in srgb, ${model.theme.foreground} 75%, transparent)`,
    "--card-chat-accent-text": hasPhoto ? PHOTO_TEXT_SECONDARY : model.theme.accent,
    "--card-background-overlay": background.kind === "image" ? background.overlay ?? "transparent" : "transparent",
    ...(background.kind === "gradient" ? { backgroundImage: `linear-gradient(${background.angle}deg, ${background.from}, ${background.to})` } : {}),
  } as CSSProperties;
  const backgroundUrl = background.kind === "image" ? model.assetUrls[background.asset_id] : undefined;
  const elements = visibleCardElements(model);
  return (
    <article className={styles.scene} style={sceneStyle} data-card-slide-scene data-render-mode={renderMode} aria-label={`카드 ${model.slide.order + 1}장`}>
      {backgroundUrl ? renderMode === "export"
        ? <Img className={styles.backgroundImage} src={backgroundUrl} alt="" />
        : <DeliveredMedia className={styles.backgroundImage} src={backgroundUrl} type="image" alt="" /> : null}
      {backgroundUrl && background.kind === "image" && background.overlay ? <span className={styles.backgroundOverlay} aria-hidden="true" /> : null}
      {model.slide.base.kind === "chat_bubble" ? <ChatBubbleBase model={model} renderMode={renderMode} /> : null}
      {elements.length === 0 && model.slide.base.kind === "plain" ? (
        <div className={styles.baseFallback}>{model.slide.base.lines.join("\n")}</div>
      ) : null}
      {elements.map((element) => (
        <div key={element.id} className={styles.element} style={cardElementStyle(element, model) as CSSProperties} data-card-element={element.id} data-card-element-type={element.type}>
          <ElementContent element={element} model={model} renderMode={renderMode} />
        </div>
      ))}
    </article>
  );
}
