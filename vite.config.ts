import { resolve } from "path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { cloudflare } from "@cloudflare/vite-plugin"

export default defineConfig({
	base: "/_admin/",
	environments: {
		client: {
			build: {
				rollupOptions: {
					input: {
						admin: resolve(__dirname, "index.html"),
						team: resolve(__dirname, "team.html"),
						debug: resolve(__dirname, "debug.html"),
					},
				},
			},
		},
	},
	plugins: [
		react(),
		cloudflare({
			configPath: "./wrangler.jsonc",
			persistState: false,
		}),
	],
})
