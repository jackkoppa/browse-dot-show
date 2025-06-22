# validation

Full-project validation scripts, used to confirm files match expected patterns.


TODO: Re-enable `validate:transcript-files-content:___`, as part part of `validate:all:___`
This will require fixing transcription chunking + Whisper processing such that we _never_ end up in scenarios that fail that validation.
Current best guess: some episodes, during chunking, result in large transcription gaps, and thus the total time between punctuation ends up being longer than the allowed max (45 seconds)
Possible improvements:
 - do overlapping chunks with ffmpeg (e.g. overlap by 10 seconds), and resolve the transcription overlap when combining chunks into the final transcript
 - as suggested in OpenAI docs, include the final part of the previous transcription, as part of the `prompt` when starting the next chunk transcription (to get more accurate understanding for Whisper)


https://platform.openai.com/docs/guides/speech-to-text#prompting

 > To preserve the context of a file that was split into segments, prompt the model with the transcript of the preceding segment. The model uses relevant information from the previous audio, improving transcription accuracy. The whisper-1 model only considers the final 224 tokens of the prompt and ignores anything earlier. For multilingual inputs, Whisper uses a custom tokenizer. For English-only inputs, it uses the standard GPT-2 tokenizer. Find both tokenizers in the open source Whisper Python package.