# PromptSpeak Governance Demo — VHS Tape
# Records a polished terminal demo as GIF and MP4
#
# Usage:
#   cd /Volumes/OWC\ drive/Dev/promptspeak/mcp-server
#   vhs demo/demo.tape
#
# Output: demo/promptspeak-demo.gif + demo/promptspeak-demo.mp4

Output demo/promptspeak-demo.gif
Output demo/promptspeak-demo.mp4

Set FontSize 16
Set Width 1200
Set Height 700
Set Theme "Catppuccin Mocha"
Set Padding 20
Set TypingSpeed 50ms
Set PlaybackSpeed 1.0

# Run the demo script directly
Sleep 500ms
Type "bash demo/demo.sh"
Enter
Sleep 90s
