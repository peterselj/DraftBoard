import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Deployed at https://peterselj.github.io/DraftBoard/ — assets must resolve
// under that sub-path. Dev server stays at "/".
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/DraftBoard/" : "/",
  plugins: [react()],
}));
