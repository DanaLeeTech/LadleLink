import { registerPlugin } from "@capacitor/core";
import type { LlBridgePlugin } from "./definitions";

const LlBridge = registerPlugin<LlBridgePlugin>("LlBridge", {
  web: () => import("./web").then((m) => new m.LlBridgeWeb()),
});

export * from "./definitions";
export { LlBridge };
