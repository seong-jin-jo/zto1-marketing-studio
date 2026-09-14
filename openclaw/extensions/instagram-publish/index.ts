import { definePluginEntry, type AnyAgentTool } from "openclaw/plugin-sdk/core";
import { createInstagramPublishTool } from "./src/instagram-publish-tool.js";

export default definePluginEntry({
  id: "instagram-publish",
  name: "Instagram Publish",
  description: "Publish an image or carousel to Instagram",
  register(api) {
    api.registerTool(createInstagramPublishTool(api) as AnyAgentTool);
  },
});
