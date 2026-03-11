const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const GEMINI_MODEL = "gemini-2.5-flash-image";
const CLAUDE_MODEL = "claude-sonnet-4-6";

const THEME_VARS_SCHEMA = `{
  "--background": "<hex color>",
  "--foreground": "<hex color>",
  "--blob-1": "<hex color>",
  "--blob-2": "<hex color>",
  "--blob-3": "<hex color>",
  "--blob-4": "<hex color>",
  "--blob-opacity": "<0.0–0.25>",
  "--blob-blur": "<80px–160px>",
  "--grad-a": "<hex color>",
  "--grad-b": "<hex color>",
  "--grad-c": "<hex color>",
  "--grad-d": "<hex color>",
  "--glass-bg": "<rgba(...)>",
  "--glass-border": "<rgba(...)>",
  "--glass-strong-bg": "<rgba(...)>",
  "--glass-strong-border": "<rgba(...)>",
  "--blur-glass": "<12px–28px>",
  "--blur-glass-strong": "<20px–44px>",
  "--font-heading": "<one of: serif, sans-serif, monospace, cursive, fantasy>",
  "--font-body": "<one of: serif, sans-serif, monospace, cursive, fantasy>",
  "--bg-pattern": "none"
}`;

// Step 1: Call Gemini to generate a color palette mood board image
async function generatePaletteImage(description, geminiApiKey) {
  const prompt = `Create a flat, clean UI color palette mood board for a theme described as: "${description}".
Show exactly 8 solid color swatches arranged in a 2-row by 4-column grid.
Each swatch should be a large solid rectangle with the hex code labeled beneath it.
Include: 1 dark or light background color, 1 contrasting foreground/text color, and 6 vivid accent/gradient colors that fit the mood.
No gradients on the swatches themselves — solid fills only. Clean white background between swatches.`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini error: ${res.status} — ${err}`);
  }

  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts ?? [];

  // Find the image part
  const imagePart = parts.find((p) => p.inlineData?.mimeType?.startsWith("image/"));
  if (!imagePart) {
    throw new Error("Gemini returned no image");
  }

  return {
    base64: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType,
  };
}

// Step 2: Send image + description to Claude to extract ThemeVars
async function extractThemeVars(description, imageBase64, imageMimeType, anthropicApiKey) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicApiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: imageMimeType,
                data: imageBase64,
              },
            },
            {
              type: "text",
              text: `This is a color palette mood board generated for the theme: "${description}".

Using the colors visible in this palette, generate a ThemeVars JSON object for a glassmorphism portfolio UI.

Rules:
- "--background": the darkest or lightest color (depending on if it's a dark/light theme)
- "--foreground": a high-contrast text color against the background
- "--blob-1" through "--blob-4": vivid accent colors for ambient background glow effects
- "--grad-a" through "--grad-d": the 4 most vivid colors for gradients and highlights
- "--glass-bg": rgba with low opacity (0.04–0.12 for dark, 0.40–0.60 for light themes)
- "--glass-border": rgba with low opacity border
- "--glass-strong-bg": slightly more opaque than glass-bg
- "--glass-strong-border": slightly more opaque than glass-border
- "--font-heading" and "--font-body": pick one generic CSS keyword each — MUST be exactly one of: serif, sans-serif, monospace, cursive, fantasy
- "--bg-pattern": always "none"

Respond with ONLY a valid JSON object matching this schema, no markdown, no explanation:
${THEME_VARS_SCHEMA}`,
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude error: ${res.status} — ${err}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text ?? "";

  // Strip markdown fences if present
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  // Remove trailing commas before } or ]
  const safe = cleaned.replace(/,(\s*[}\]])/g, "$1");

  const vars = JSON.parse(safe);

  // Fix malformed hex colors (trim to 6 digits if too long)
  for (const [key, val] of Object.entries(vars)) {
    if (typeof val === "string" && val.startsWith("#") && val.length > 7) {
      vars[key] = "#" + val.slice(1, 7);
    }
  }

  return vars;
}

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "POST only" }), {
        status: 405,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    let description;
    try {
      const body = await request.json();
      description = body.description?.trim();
      if (!description) throw new Error("Missing description");
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    try {
      // Step 1: Generate palette image with Gemini
      const { base64, mimeType } = await generatePaletteImage(description, env.GOOGLE_API_KEY);

      // Step 2: Extract ThemeVars with Claude vision
      const vars = await extractThemeVars(description, base64, mimeType, env.ANTHROPIC_API_KEY);

      return new Response(JSON.stringify(vars), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
  },
};
