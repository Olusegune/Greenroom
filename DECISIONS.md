# Decisions

| ID | Date | Decision | Evidence |
|---|---|---|---|
| D-01 | 2026-10-26 | Default speech model is ElevenLabs `eleven_v4`, called directly. `eleven_v3` stays selectable for comparison. | Owner listened to the Slice 0 lab: v4 sounded better than v3. Laughs, sighs, crying, whispers, gasps and out-of-breath lines were rated good. Report not saved, so ratings are the owner's verbal summary. |
| D-02 | 2026-10-26 | Nigerian English accent is not claimed. The test used a default voice, so it measured the voice, not the model. Retest with a library or designed voice. | Owner: the Nigerian line "still bad". |
| D-03 | 2026-10-26 | Kie is secondary until its Turbo voice fix and Dialogue v3 errors are retested. | Kie 422 "voiceId cannot be empty" (fixed in c7589f0); Dialogue v3 "Internal Error" (open). |
| D-04 | 2026-10-26 | Voice design, cloning and a saved voice library go through ElevenLabs and belong to Slice 1 (Cast). Cloning needs a plan that allows it and a permission checkbox. | Owner request. |
| D-05 | 2026-10-26 | VoiceKiller is integrated as a second voice source (key and user id in the Credential Manager). It has no inline sound tags, so tags are stripped and delivery and pace go in its `instructions` field; the UI warns before paying when a line asks for sounds it cannot make. | Owner request; request shapes from the VoiceKiller API docs as read for Soundstage on 2026-10-23. Tested against a fake server only. |
| D-06 | 2026-10-26 | Multilingual: language is a per-character label and a voice-search filter, not a switch sent to the model. Eleven v4 detects the language from the text, so mixed-language lines (Taglish, Pidgin, code-switching) are written as they are spoken and the voice supplies the accent. No accent is claimed until the owner listens. | Eleven v4 lists 90+ languages; docs do not state a v4 language-code switch. |
| D-07 | 2026-10-26 | Every paid action asks first with a character count. Single takes and samples offer a per-session "do not ask again"; batches and voice design always ask. | Owner rule: no unconfirmed spend. |
