import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  manifest: {
    permissions: ["sidePanel", "activeTab", "storage", "tabs", "scripting"],
    host_permissions: ["<all_urls>"],
    action: {},
    side_panel: {
      default_path: "index.html",
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  modules: ["@wxt-dev/module-react"],
});
