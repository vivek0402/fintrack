# FinTrack NIM Migration

## Phase: NVIDIA NIM provider integration

- [x] P0: Read and understand current ai.js and gemini.js structure before touching anything
- [x] P1: Add NIM OpenAI client (nimClient) using NVIDIA_API_KEY env var
- [x] P2: Add NIM model constants to MODELS object
- [x] P3: Add 'nim' branch to provider dispatch (getClient or equivalent switch)
- [x] P4: Add nim to FALLBACK_CHAIN (nim → groq1 → gemini)
- [x] P5: Update ROUTES config for 11 routes (see spec below)
- [x] P6: Update getVisionModel() in gemini.js to use NIM Llama 3.2 11B Vision
- [x] P7: Add NVIDIA_API_KEY to .env.example (and .env if it exists)
- [x] P8: Smoke test each provider path manually with a curl or node script
- [x] P9: Verify fallback chain still works if NVIDIA_API_KEY is missing
