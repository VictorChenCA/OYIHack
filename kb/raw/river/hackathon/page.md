# River AI: Own Your Intelligence hackathon build guide
Source: https://river.ai/own-your-intelligence-hackathon (mirrored Sep 27 2026; text of the page)

**Own your intelligence.** Build something useful, ambitious, or unexpected with a custom model.
**The best showcase of using a custom model wins.** River API: no local GPU needed.
Sep 27 2026, San Francisco, 12–6 PM Pacific. Event page: https://events.ycombinator.com/gbrain-qm-river-memorable-hackathon

## 01 / The challenge: your idea, your model
Build something useful, ambitious, or unexpected with a custom model. Bring an agent, a specialist, a
creative tool, or an idea of your own. Choose the approach that fits your project.
Start with the River documentation and talk to the River team about model access and your idea.
Docs: https://docs.river.ai · Console: https://console.river.ai

**Get free hackathon credits:** come to the River AI booth to get free hackathon credits. Any unused
credits expire at the end of the day.

## 02 / An optional example: a model that learns your writing style
The style-chat example learns from your conversation. Every eight user messages trigger a LoRA
training step; the latest loaded adapter rewrites the assistant's replies. Use it for inspiration or
build something entirely different.
Files: https://river.ai/assets/style_chat.py, https://river.ai/assets/test_style_chat.py (mirrored next to this file)
Requires Python 3.12+, uv (https://docs.astral.sh/uv/getting-started/installation/), and a River API key.
Save both files in the same folder.

```bash
export RIVER_API_KEY="your-river-api-key"
uv run --no-project style_chat.py
```
Use `/status` to check progress and `/quit` to finish. (On Windows: `$env:RIVER_API_KEY="..."` in PowerShell.)

Check the example: `uv run --no-project test_style_chat.py -v`. Seven unit tests check batching,
checkpoint restoration, and adapter loading with simulated training. They need no API key and do
not verify live training or model quality.

## 03 / Show what you built: make the custom model matter
- **Demo the experience.** What did you build, and who is it for?
- **Explain what the model learned.** Show your training examples or reward signal.
- **Show why it helps.** Compare results on unseen tasks and share what you learned.

Projects are due at 5:00 PM Pacific. Follow the organizers' submission instructions.
