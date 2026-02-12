# Uploading Demo to Loom

## Quick Path (Recommended)

1. **Record the demo:**
   ```bash
   cd "/Volumes/OWC drive/Dev/promptspeak/mcp-server"
   ./demo/record.sh vhs
   ```
   This produces `demo/promptspeak-demo.mp4` (~30-60 seconds).

2. **Upload to Loom:**
   - Go to [loom.com/looms/videos](https://www.loom.com/looms/videos)
   - Sign in as `ahgen.topps@erp-access.com`
   - Click "New video" → "Upload"
   - Select `demo/promptspeak-demo.mp4`
   - Title: "PromptSpeak: Pre-Execution Governance for AI Agents"
   - Description: "41 MCP tools · 554 tests · MIT licensed. Demonstrates frame validation, governed execution, human-in-the-loop holds, drift detection, and audit trail."

## Automated Upload (Playwright via MCP_DOCKER)

If browser automation is available, use Claude Code with MCP_DOCKER:

```
1. browser_navigate → https://www.loom.com/login
2. browser_fill_form → email: ahgen.topps@erp-access.com
3. browser_navigate → https://www.loom.com/looms/videos
4. browser_click → "New video" button
5. browser_click → "Upload" option
6. browser_file_upload → demo/promptspeak-demo.mp4
7. browser_fill_form → title, description
8. browser_click → "Share" / "Done"
```

Note: Loom requires a Business plan ($15/mo) for video upload. Free plans only support live recording.

## Alternative: Direct Screen Recording

If you prefer to record a live walkthrough instead of scripted:

1. Open Loom Chrome extension
2. Select "Screen + Camera" or "Screen only"
3. Run `./demo/demo.sh` in terminal
4. Stop recording when demo completes
5. Loom auto-uploads and provides a share link

## Alternative Hosting (No Loom Plan Required)

- **YouTube (unlisted)**: Free, no file size limit, embed anywhere
- **GitHub**: Attach MP4 to a release or discussion post
- **asciinema.org**: Free for terminal recordings (`asciinema upload demo/promptspeak-demo.cast`)
