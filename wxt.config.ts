import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    permissions: ["sidePanel"],
    action: {}, // Required to create an action button
  },
  modules: ["@wxt-dev/module-react"],
});
