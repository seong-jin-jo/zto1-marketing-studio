import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "../../../src/app/globals.css";
import { CardCanvasEditor } from "../../../src/components/studio/card/CardCanvasEditor";
import { migrateCardDeckV2ToV3 } from "../../../src/lib/studio/card-deck-v2-to-v3";
import type { CardDeck } from "../../../src/lib/studio/card-deck-contract";
import type { CardDeckV3 } from "../../../src/lib/studio/card-element-contract";
import sourceFixture from "../../studio/fixtures/deck-d100.v2.json";

const profileSvg = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScxNjAnIGhlaWdodD0nMTYwJz48cmVjdCB3aWR0aD0nMTYwJyBoZWlnaHQ9JzE2MCcgZmlsbD0nI0ZFNDUwMCcvPjxjaXJjbGUgY3g9JzgwJyBjeT0nNTUnIHI9JzMwJyBmaWxsPScjRkZGRkZGJy8+PHBhdGggZD0nTTMwIDE0MGM1LTM1IDk1LTM1IDEwMCAwJyBmaWxsPScjRkZGRkZGJy8+PC9zdmc+";
const source = structuredClone(sourceFixture) as unknown as CardDeck;
source.brand.profile_image_url = profileSvg;
source.brand.profile_image_asset_id = "s5b-profile.svg";
const initial = migrateCardDeckV2ToV3(source);

function Proof() {
  const [deck, setDeck] = useState<CardDeckV3>(initial);
  return (
    <section data-room="edit">
      <CardCanvasEditor deck={deck} assetUrls={{ "s5b-profile.svg": profileSvg }} onDeckChange={setDeck} />
    </section>
  );
}

createRoot(document.querySelector("#root")!).render(<Proof />);
