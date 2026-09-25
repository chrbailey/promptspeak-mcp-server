# FDE Onboarding Portal

A self-contained onboarding & program overview page for the **Anthropic Academy
Forward Deployed Engineer** track at ERP Access. First candidate: **Chanel**.

- `index.html` — the whole page. Inline CSS + inline SVG graphics, no external
  assets, no build step, no tracking. Marked `noindex`.
- `netlify.toml` — drop-in Netlify config (publish dir = this folder).

## Preview locally

Just open the file:

```bash
open onboarding/index.html        # macOS
# or serve it:
npx serve onboarding
```

## Publishing options

> **Heads-up:** this page is an *internal* onboarding doc. Before publishing to a
> public URL, decide whether it should be access-controlled. The page already
> omits personal contact details for this reason.

### Netlify (the preference)
There are three easy ways:

1. **Drag-and-drop** — go to <https://app.netlify.com/drop> and drag the
   `onboarding/` folder onto the page. Instant URL, no account wiring needed.
2. **CLI** —
   ```bash
   npm install -g netlify-cli
   netlify deploy --dir=onboarding --prod
   ```
3. **Git-connected** — point a Netlify site at this repo with base directory
   `onboarding/` (config is already in `netlify.toml`). Every push redeploys.

To restrict access (recommended for HR content), enable Netlify
**Password protection** or **Identity** on the site (paid feature), or keep it on
an unguessable URL and share directly.

### Vercel (available in this workspace)
This environment has a Vercel connector, so it can be deployed there too:
set the project root to `onboarding/` and deploy as a static site.
