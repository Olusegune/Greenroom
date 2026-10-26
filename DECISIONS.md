# Decisions

| ID | Date | Decision | Evidence |
|---|---|---|---|
| D-01 | 2026-10-26 | Default speech model is ElevenLabs `eleven_v4`, called directly. `eleven_v3` stays selectable for comparison. | Owner listened to the Slice 0 lab: v4 sounded better than v3. Laughs, sighs, crying, whispers, gasps and out-of-breath lines were rated good. Report not saved, so ratings are the owner's verbal summary. |
| D-02 | 2026-10-26 | Nigerian English accent is not claimed. The test used a default voice, so it measured the voice, not the model. Retest with a library or designed voice. | Owner: the Nigerian line "still bad". |
| D-03 | 2026-10-26 | Kie is secondary until its Turbo voice fix and Dialogue v3 errors are retested. | Kie 422 "voiceId cannot be empty" (fixed in c7589f0); Dialogue v3 "Internal Error" (open). |
| D-04 | 2026-10-26 | Voice design, cloning and a saved voice library go through ElevenLabs and belong to Slice 1 (Cast). Cloning needs a plan that allows it and a permission checkbox. | Owner request. |
