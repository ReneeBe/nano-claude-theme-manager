# nano-claude-theme-manager

A Cloudflare Worker that chains Gemini image generation and Claude vision to produce a full UI theme from a text description. Day 3 of my [50 projects challenge](https://reneebe.github.io).

**No live demo** — this is a backend API, not a frontend app. It's consumed by [Theme Generator](https://reneebe.github.io/theme-generator/) (Day 4).

## How it works

1. You POST a text description (e.g. "deep sea bioluminescence")
2. Gemini generates a color palette mood board image — 8 solid color swatches in a grid
3. Gemini generates a tileable background pattern image in the same style
4. Claude receives both images and extracts a `ThemeVars` JSON object with all CSS custom properties needed to theme the portfolio

The image generation step solves the problem of asking a text model to be a visual designer: Gemini handles the visual imagination, Claude handles extraction and structure.

## Output schema

```json
{
  "--background": "#hex",
  "--foreground": "#hex",
  "--grad-a": "#hex",
  "--grad-b": "#hex",
  "--grad-c": "#hex",
  "--grad-d": "#hex",
  "--glass-bg": "rgba(...)",
  "--font-heading": "serif | sans-serif | monospace | cursive | fantasy",
  "--bg-pattern": "none | url(...)"
}
```

## Stack

- [Cloudflare Workers](https://workers.cloudflare.com/)
- [Gemini](https://ai.google.dev/) (`gemini-3.1-flash-image-preview`) — image generation
- [Claude](https://anthropic.com) (`claude-sonnet-4-6`) — vision + JSON extraction

## Deploy

```bash
npx wrangler deploy
```

Set secrets after deploying:

```bash
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put ANTHROPIC_API_KEY
```
