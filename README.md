# Greenroom

Sound without limits. Write a scene, give each character a voice, direct how they sound (excited, whispering, laughing, coughing, out of breath), make takes, and export the finished audio. A Windows desktop app.

## What is in v0.1

| Area | What it does |
|---|---|
| Script | Write `NAME: line` scenes, with `(directions)` and `# Scene titles`. Any language, mixed languages in a line. Editing never throws away voices or takes. |
| Voices | One library: find in ElevenLabs' shared library by language and accent, design a voice from a description, clone from a recording (with a permission tick), add VoiceKiller voices, import your ElevenLabs account voices. |
| Cast | A voice and a language label per character, with a sample of their first line. |
| Perform | Emotion and sound chips per line (laugh, sigh, crying, gasp, cough, out of breath and more), speed and pause, three takes at a time, pick the best, add sound clips (sneeze, door) before or after a line. Eleven v4 by default, v3 selectable. |
| Export | One mixed WAV, one per scene, and every line as its own file by character. Optional looping atmosphere under the scene. |
| Voice lab | The listening comparison used to pick models. |
| Safety | Every paid action shows a cost sheet first. Keys live in the Windows Credential Manager only. |

## Not built yet
AI Director (suggest emotions and sounds from the script), Fountain/PDF import, a translated interface, local models, video.

## Develop
From `app/`: `npm install`, `npx tsc --noEmit`, `npx vitest run`, `cd src-tauri && cargo test`, `npx tauri build`.
Opening the front end in a plain browser (`npx vite`) uses a free demo backend, so every screen can be viewed without spending.
