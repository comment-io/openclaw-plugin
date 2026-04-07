import { defineSetupPluginEntry } from "openclaw/plugin-sdk/channel-core";
import { commentDocsSetupPlugin } from "./channel.setup.js";

export { commentDocsSetupPlugin } from "./channel.setup.js";

export default defineSetupPluginEntry(commentDocsSetupPlugin);
