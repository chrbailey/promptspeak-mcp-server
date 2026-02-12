#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# PromptSpeak Demo Recorder
# ═══════════════════════════════════════════════════════════════════════════════
# Three recording modes:
#   1. vhs    — Scripted terminal recording → GIF + MP4 (best for demos)
#   2. screen — Full screen capture via ffmpeg → MP4 (for Loom upload)
#   3. ascii  — Terminal-only via asciinema → GIF via agg
#
# Usage:
#   ./record.sh vhs      # Automated, reproducible, polished
#   ./record.sh screen    # Full screen — run demo.sh manually in another terminal
#   ./record.sh ascii     # Terminal recording — runs demo.sh automatically
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR"

MODE="${1:-vhs}"

case "$MODE" in
  vhs)
    echo "Recording with VHS (scripted terminal)..."
    echo "Output: promptspeak-demo.gif + promptspeak-demo.mp4"
    cd "$SCRIPT_DIR/.."
    # VHS needs Chrome path on macOS
    export VHS_CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    vhs demo/demo.tape
    echo ""
    echo "Done! Files:"
    ls -lh "$OUTPUT_DIR/promptspeak-demo"* 2>/dev/null
    ;;

  screen)
    echo "Screen recording with ffmpeg..."
    echo "This captures your entire screen. Run demo.sh in another terminal."
    echo ""
    echo "Press Enter to start recording, then Ctrl+C to stop."
    read -r

    OUTPUT="$OUTPUT_DIR/promptspeak-demo-screen.mp4"

    # macOS screen capture via AVFoundation
    # Device 1 is typically the main screen
    ffmpeg -f avfoundation -framerate 30 -i "1:none" \
      -c:v libx264 -preset ultrafast -crf 18 \
      -pix_fmt yuv420p \
      "$OUTPUT"

    echo ""
    echo "Saved: $OUTPUT"
    ls -lh "$OUTPUT"
    ;;

  ascii)
    echo "Recording with asciinema..."
    CAST_FILE="$OUTPUT_DIR/promptspeak-demo.cast"
    GIF_FILE="$OUTPUT_DIR/promptspeak-demo-ascii.gif"

    asciinema rec "$CAST_FILE" --command "$SCRIPT_DIR/demo.sh" --overwrite --cols 120 --rows 35

    echo ""
    echo "Converting to GIF with agg..."
    agg "$CAST_FILE" "$GIF_FILE" --theme monokai --font-size 16

    echo ""
    echo "Converting to MP4 with ffmpeg..."
    ffmpeg -y -i "$GIF_FILE" \
      -movflags faststart -pix_fmt yuv420p \
      -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" \
      "$OUTPUT_DIR/promptspeak-demo-ascii.mp4" 2>/dev/null

    echo ""
    echo "Done! Files:"
    ls -lh "$OUTPUT_DIR/promptspeak-demo"* 2>/dev/null
    ;;

  *)
    echo "Usage: $0 {vhs|screen|ascii}"
    echo ""
    echo "  vhs    — Scripted terminal recording (recommended)"
    echo "  screen — Full screen capture via ffmpeg"
    echo "  ascii  — Terminal recording via asciinema"
    exit 1
    ;;
esac
