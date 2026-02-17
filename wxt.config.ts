import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  manifest: {
    permissions: ["sidePanel", "activeTab", "storage", "tabs", "scripting"],
    host_permissions: ["<all_urls>"],
    action: {},
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  modules: ["@wxt-dev/module-react"],
});
