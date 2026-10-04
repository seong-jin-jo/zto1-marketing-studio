import type { CSSProperties } from "react";
import type { CardElement, TextElement } from "@/lib/studio/card-element-contract";
import { cardElementStyle, visibleCardElements, type CardSlideRenderModel } from "@/lib/studio/card-render-model";
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

function ElementContent({ element, model }: { element: CardElement; model: CardSlideRenderModel }) {
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
  return <img className={styles.media} src={src} alt={element.alt} draggable={false} />;
}

export function CardSlideScene({ model, renderMode }: CardSlideSceneProps) {
  const background = model.slide.background;
  const sceneStyle = {
    "--card-stage-ratio": `${model.logicalWidth} / ${model.logicalHeight}`,
    "--card-stage-background": background.kind === "solid" ? background.color : model.theme.background,
    "--card-stage-foreground": model.theme.foreground,
    ...(background.kind === "gradient" ? { backgroundImage: `linear-gradient(${background.angle}deg, ${background.from}, ${background.to})` } : {}),
  } as CSSProperties;
  const backgroundUrl = background.kind === "image" ? model.assetUrls[background.asset_id] : undefined;
  const elements = visibleCardElements(model);
  return (
    <article className={styles.scene} style={sceneStyle} data-card-slide-scene data-render-mode={renderMode} aria-label={`카드 ${model.slide.order + 1}장`}>
      {backgroundUrl ? <img className={styles.backgroundImage} src={backgroundUrl} alt="" /> : null}
      {elements.length === 0 && model.slide.base.kind === "plain" ? (
        <div className={styles.baseFallback}>{model.slide.base.lines.join("\n")}</div>
      ) : null}
      {elements.map((element) => (
        <div key={element.id} className={styles.element} style={cardElementStyle(element, model) as CSSProperties} data-card-element={element.id} data-card-element-type={element.type}>
          <ElementContent element={element} model={model} />
        </div>
      ))}
    </article>
  );
}
