import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" -> относительные пути к ассетам.
// Благодаря этому сайт работает на GitHub Pages по адресу
// username.github.io/любое-имя-репозитория/ без правок под имя репо.
export default defineConfig({
  base: "./",
  plugins: [react()],
});
