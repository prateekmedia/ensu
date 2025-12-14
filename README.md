# ensu

Run LLMs locally in your browser, privately, on-device. No server required.

![ensu screenshot](screenshot.png)

## Features

- 🧠 **Local LLM** - Run models directly in the browser via WebGPU
- 🌐 **Static Site** - Works on GitHub Pages, no backend needed
- 🔌 **OpenAI Compatible** - Connect to any OpenAI-compatible API
- 💬 **Sessions** - Chat sessions saved in browser (localStorage)
- ⚡ **Streaming** - Real-time token streaming
- 🔒 **Private** - Everything runs in your browser, no data sent to servers

## Try It

Visit [ensu.ente.io](https://ensu.ente.io)

## Self-Host

Just serve the static files! Options:

1. **GitHub Pages** - Fork this repo, enable Pages in settings
2. **Any static host** - Upload files to Netlify, Vercel, Cloudflare Pages, etc.
3. **Local** - `python -m http.server` or any static file server

## Models

### Local (WebGPU)

| Model | Size | VRAM |
|-------|------|------|
| Llama 3.2 3B | 3B | ~2.3GB |
| Llama 3.2 1B | 1B | ~879MB |
| SmolLM2 360M | 360M | ~376MB |

Models run entirely in your browser using WebGPU. First load downloads the model, subsequent loads use cached version.

### Remote

Connect to any OpenAI-compatible API via Settings:
- Local Ollama: `http://localhost:11434/v1`
- OpenAI: `https://api.openai.com/v1`
- Any compatible API

## Browser Requirements

- **WebGPU**: Chrome 113+, Edge 113+, Firefox Nightly
- **VRAM**: Check model requirements above

## Files

```
index.html      # Main HTML
app.js          # Application logic  
local-llm.js    # WebGPU LLM client (MLC)
styles.css      # Styles
```

## License

MIT
