import { createMeshConfig } from "@baditaflorin/mesh-common";

export const config = createMeshConfig({
  appName: "mesh-bracket",
  description: "Single-elim tournament bracket — opponents scan each other to record outcomes",
  accentHex: "#dc2626",
  version: __APP_VERSION__,
  commit: __GIT_COMMIT__,
});
