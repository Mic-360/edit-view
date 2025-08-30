import { GoogleGenAI } from "@google/genai";
import { trpcServer } from "@hono/trpc-server";
import "dotenv/config";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import mime from "mime";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import path from "node:path";
import { createContext } from "./lib/context";
import { appRouter } from "./routers/index";

const app = new Hono();

// --- Throttling and retry helpers (module scope) ---
const MIN_INTERVAL_MS = Number(process.env.GEMINI_MIN_INTERVAL_MS || 2000);

class Throttler {
	private lastTime = 0;
	private running = false;
	private queue: Array<() => void> = [];
	constructor(private interval: number) { }
	async schedule<T>(fn: () => Promise<T>): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			const run = async () => {
				const now = Date.now();
				const wait = Math.max(0, this.lastTime + this.interval - now);
				if (wait > 0) await new Promise((r) => setTimeout(r, wait));
				this.lastTime = Date.now();
				try {
					const result = await fn();
					resolve(result);
				} catch (e) {
					reject(e);
				} finally {
					this.running = false;
					const next = this.queue.shift();
					if (next) {
						this.running = true;
						next();
					}
				}
			};
			if (!this.running) {
				this.running = true;
				run();
			} else {
				this.queue.push(run);
			}
		});
	}
}

const throttler = new Throttler(MIN_INTERVAL_MS);

function parseRetryDelayMs(e: unknown): number | undefined {
	const str = (e as any)?.message as string | undefined;
	if (!str) return undefined;
	try {
		const data = JSON.parse(str);
		const details: any[] = data?.error?.details || [];
		const ri = details.find((d) => d["@type"] === "type.googleapis.com/google.rpc.RetryInfo");
		const delay: string | undefined = ri?.retryDelay;
		if (delay && delay.endsWith("s")) {
			const sec = parseFloat(delay.slice(0, -1));
			if (!Number.isNaN(sec)) return Math.ceil(sec * 1000);
		}
	} catch { }
	return undefined;
}

function isRateLimited(e: unknown): boolean {
	const msg = ((e as any)?.message as string | undefined) || "";
	return msg.includes("RESOURCE_EXHAUSTED") || msg.includes("Too Many Requests") || msg.includes("quota");
}

async function withRetries<T>(work: () => Promise<T>, maxRetries = 2): Promise<T> {
	let attempt = 0;
	let lastErr: unknown;
	while (attempt <= maxRetries) {
		try {
			return await work();
		} catch (e) {
			lastErr = e;
			if (isRateLimited(e) && attempt < maxRetries) {
				const delay = parseRetryDelayMs(e) ?? 2000 * Math.pow(2, attempt);
				await new Promise((r) => setTimeout(r, delay));
				attempt++;
				continue;
			}
			break;
		}
	}
	throw lastErr;
}

app.use(logger());
app.use(
	"/*",
	cors({
		origin: process.env.CORS_ORIGIN || "",
		allowMethods: ["GET", "POST", "OPTIONS"],
		allowHeaders: ["Content-Type"],
	}),
);

app.use(
	"/trpc/*",
	trpcServer({
		router: appRouter,
		createContext: (_opts, context) => {
			return createContext({ context });
		},
	}),
);

app.get("/", (c) => {
	return c.text("OK");
});

// Serve edited images under /edited/* from ./public
app.use("/edited/*", serveStatic({ root: "./public" }));

// POST /api/edit-image - image editing via Gemini
app.post("/api/edit-image", async (c) => {
	try {
		const apiKey = process.env.GEMINI_API_KEY;
		if (!apiKey) {
			return c.json({ success: false, error: "Missing GEMINI_API_KEY" }, 500);
		}

		const contentType = c.req.header("content-type") || "";
		if (!contentType.includes("multipart/form-data")) {
			return c.json({ success: false, error: "Content-Type must be multipart/form-data" }, 400);
		}

		const form = await c.req.formData();
		const file = form.get("image");
		const prompt = form.get("prompt");

		if (!file || !(file instanceof File)) {
			return c.json({ success: false, error: "Field 'image' is required" }, 400);
		}
		if (!prompt || typeof prompt !== "string") {
			return c.json({ success: false, error: "Field 'prompt' is required" }, 400);
		}

		const trimmedPrompt = prompt.trim();
		if (trimmedPrompt.length === 0) {
			return c.json({ success: false, error: "Prompt cannot be empty" }, 400);
		}
		if (trimmedPrompt.length > 500) {
			return c.json({ success: false, error: "Prompt must be at most 500 characters" }, 400);
		}

		// Validate file type and size
		const allowedMime = new Set(["image/jpeg", "image/png", "image/webp"]);
		if (!allowedMime.has(file.type)) {
			return c.json({ success: false, error: "Unsupported file type. Use JPG, PNG, or WEBP." }, 400);
		}
		const sizeLimit = 5 * 1024 * 1024; // 5MB
		if (file.size > sizeLimit) {
			return c.json({ success: false, error: "Image must be 5MB or smaller" }, 400);
		}

		const arrayBuffer = await file.arrayBuffer();
		const base64Image = Buffer.from(arrayBuffer).toString("base64");

		const model = "gemini-2.5-flash-image-preview";
		// const generationConfig = { responseModalities: ["IMAGE", "TEXT"] as string[] };

		const contents = [
			{
				role: "user" as const,
				parts: [
					{ text: trimmedPrompt },
					{ inlineData: { data: base64Image, mimeType: file.type } },
				],
			},
		];

		// Throttled request with retries using SDK (non-stream)
		const ai = new GoogleGenAI({ apiKey });
		const config = { responseModalities: ["IMAGE", "TEXT"] as string[] };
		const sdkResponse = await withRetries(
			() => throttler.schedule(() => ai.models.generateContent({ model, contents, config })),
			2,
		);

		// Ensure output dir exists (created in repo, but check at runtime too)
		const editedDir = path.join(process.cwd(), "public", "edited");
		try {
			await stat(editedDir);
		} catch {
			// @ts-ignore - Bun provides mkdirSync via fs/promises in runtime, but not needed; rely on precreated dir
		}

		let imageUrl: string | null = null;
		let textOut = "";
		let fileIndex = 0;
		const candidates = (sdkResponse as any)?.candidates ?? [];
		for (const cand of candidates) {
			const parts = cand?.content?.parts ?? [];
			for (const part of parts) {
				if (part?.inlineData) {
					const mimeType: string = part.inlineData.mimeType || "image/png";
					const data: string = part.inlineData.data || "";
					const ext = mime.getExtension(mimeType) || "png";
					const id = randomUUID();
					const filename = `${id}-${fileIndex++}.${ext}`;
					const absPath = path.join(editedDir, filename);
					const buffer = Buffer.from(data, "base64");
					await Bun.write(absPath, buffer);
					const { origin } = new URL(c.req.url);
					imageUrl = `${origin}/edited/${filename}`;
				} else if (typeof part?.text === "string" && part.text.length > 0) {
					textOut += part.text;
				}
			}
		}

		if (!imageUrl) {
			return c.json({ success: false, error: "Model did not return an image" }, 502);
		}

		return c.json({ success: true, imageUrl, text: textOut });
	} catch (err) {
		const message = err instanceof Error ? err.message : "Unknown error";
		const status = (message.includes("RESOURCE_EXHAUSTED") || message.includes("Too Many Requests")) ? 429 : 500;
		const retryAfterMs = parseRetryDelayMs(err);
		return c.json({ success: false, error: message, retryAfterMs }, status);
	}
});

export default app;

// Start server when executed directly (bun run src/index.ts)
if (import.meta.main) {
	const port = Number(process.env.PORT || 3000);
	Bun.serve({ port, fetch: app.fetch });
	console.log(`Server listening at http://localhost:${port}`);
}
