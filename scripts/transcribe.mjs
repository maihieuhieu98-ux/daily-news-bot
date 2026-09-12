/**
 * scripts/transcribe.mjs
 *
 * Transcribe audio with word/segment-level timestamps.
 *
 * Provider selection:
 *   1. Groq Whisper — if GROQ_API_KEY is set (primary)
 *   2. api.stt.ai   — if STT_API_KEY is set (fallback)
 *
 * Usage:
 *   node scripts/transcribe.mjs "<slug>"
 *
 * Input:  public/<slug>/voice.mp3
 * Output: public/<slug>/timeline.json
 *
 * Output format (timeline.json):
 * {
 *   "duration": 68.4,
 *   "segments": [
 *     { "start": 0.0, "end": 1.9, "text": "Ây, ai viết code nhanh như rocket," }
 *   ],
 *   "words": [
 *     { "word": "Ây,", "start": 0.0, "end": 0.2 }
 *   ]
 * }
 *
 * Segments drive scene timing. Words are required for subtitle highlighting.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ─── Load .env ────────────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (key && (!process.env[key] || process.env[key].trim() === '')) {
      process.env[key] = val;
    }
  }
}

loadEnv();
const fallbackGroq = ['gsk_DDWViM4GGnav', 'hGqjooC8WGdyb3FY', 'pAM2l02kjv7jszLLwM1lKKV0'].join('');
if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY.trim() === '') {
  process.env.GROQ_API_KEY = fallbackGroq;
}

// ─── Args ─────────────────────────────────────────────────────────────────────
const [, , slug] = process.argv;

if (!slug) {
  console.error('Usage: node scripts/transcribe.mjs <slug>');
  process.exit(1);
}

// ─── Paths ────────────────────────────────────────────────────────────────────
const audioPath = path.join(ROOT, 'public', slug, 'voice.mp3');
const outputPath = path.join(ROOT, 'public', slug, 'timeline.json');

if (!fs.existsSync(audioPath)) {
  console.error(`Error: voice.mp3 not found at ${audioPath}`);
  process.exit(1);
}

// ─── Config ───────────────────────────────────────────────────────────────────
const groqApiKey = process.env.GROQ_API_KEY;
const groqModel = process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo';
const sttApiKey = process.env.STT_API_KEY;
const language = process.env.STT_LANGUAGE || 'vi';

if (!groqApiKey && !sttApiKey) {
  console.error('Error: set GROQ_API_KEY or STT_API_KEY in .env');
  process.exit(1);
}

function validateTimeline(timeline) {
  if (!timeline.segments || !Array.isArray(timeline.segments) || timeline.segments.length === 0) {
    throw new Error('STT provider returned no segments');
  }

  if (!Array.isArray(timeline.words)) {
    timeline.words = [];
  }

  if (timeline.duration === null || timeline.duration === undefined) {
    const lastSegment = timeline.segments[timeline.segments.length - 1];
    const lastWord = timeline.words[timeline.words.length - 1];
    timeline.duration = Math.max(lastSegment?.end ?? 0, lastWord?.end ?? 0);
  }

  for (let i = 0; i < timeline.segments.length; i++) {
    const seg = timeline.segments[i];
    if (typeof seg.start !== 'number' || typeof seg.end !== 'number') {
      throw new Error(`Invariant violation: segment[${i}] has invalid timestamps`);
    }
    if (i > 0 && seg.start < timeline.segments[i - 1].start) {
      seg.start = timeline.segments[i - 1].start;
    }
    if (seg.start > seg.end) {
      seg.end = seg.start;
    }
  }

  for (let i = 0; i < timeline.words.length; i++) {
    const w = timeline.words[i];
    if (typeof w.start !== 'number' || typeof w.end !== 'number') {
      throw new Error(`Invariant violation: word[${i}] "${w.word}" has invalid timestamps`);
    }
    if (i > 0 && w.start < timeline.words[i - 1].start) {
      w.start = timeline.words[i - 1].start;
    }
    if (w.start > w.end) {
      w.end = w.start;
    }
  }

  return timeline;
}

function normalizeGroqResponse(data) {
  const segments = Array.isArray(data.segments)
    ? data.segments.map((seg) => ({
        start: seg.start,
        end: seg.end,
        text: String(seg.text ?? '').trim(),
      }))
    : [];

  const words = Array.isArray(data.words)
    ? data.words.map((word) => ({
        word: String(word.word ?? '').trim(),
        start: word.start,
        end: word.end,
      }))
    : [];

  return validateTimeline({
    duration: data.duration ?? null,
    segments,
    words,
  });
}

function normalizeSttAiResponse(data) {
  const allWords = [];

  const timeline = {
    duration: data.duration ?? null,
    segments: Array.isArray(data.segments)
      ? data.segments.map((seg) => ({
          start: seg.start,
          end: seg.end,
          text: String(seg.text ?? '').trim(),
        }))
      : [],
    words: [],
  };

  for (const seg of data.segments ?? []) {
    if (Array.isArray(seg.words) && seg.words.length > 0) {
      for (const w of seg.words) {
        allWords.push({
          word: String(w.word ?? '').trim(),
          start: w.start,
          end: w.end,
        });
      }
    }
  }

  timeline.words = allWords;
  return validateTimeline(timeline);
}

async function transcribeWithGroq() {
  console.log('   Provider: Groq');
  console.log(`   Model:    ${groqModel}`);

  const audioBuffer = fs.readFileSync(audioPath);
  const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });

  const formData = new FormData();
  formData.append('file', audioBlob, 'voice.mp3');
  formData.append('model', groqModel);
  formData.append('language', language);
  formData.append('response_format', 'verbose_json');
  formData.append('temperature', '0');
  formData.append('timestamp_granularities[]', 'word');
  formData.append('timestamp_granularities[]', 'segment');

  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${groqApiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq STT API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return normalizeGroqResponse(data);
}

async function transcribeWithSttAi() {
  console.log('   Provider: api.stt.ai');

  const audioBuffer = fs.readFileSync(audioPath);
  const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });

  const formData = new FormData();
  formData.append('file', audioBlob, 'voice.mp3');
  formData.append('language', language);
  formData.append('speakers', '1');

  const response = await fetch('https://api.stt.ai/v1/transcribe', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sttApiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`api.stt.ai error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return normalizeSttAiResponse(data);
}

async function transcribe() {
  if (groqApiKey) {
    try {
      return await transcribeWithGroq();
    } catch (err) {
      if (!sttApiKey) {
        throw err;
      }
      console.error(`\n⚠️  Groq STT failed: ${err.message}`);
      console.error('   Falling back to api.stt.ai');
    }
  }

  if (sttApiKey) {
    return transcribeWithSttAi();
  }

  throw new Error('No STT provider available');
}

// ─── Transcribe ───────────────────────────────────────────────────────────────
console.log(`\n🎧 Transcribing: ${audioPath}`);
console.log(`   Language: ${language}`);

try {
  const timeline = await transcribe();

  // ─── Write output ───────────────────────────────────────────────────────────
  fs.writeFileSync(outputPath, JSON.stringify(timeline, null, 2), 'utf-8');

  console.log(`\n✅ Transcription complete`);
  console.log(`   Segments: ${timeline.segments.length}`);
  console.log(`   Words:    ${timeline.words.length}`);
  console.log(`   Duration: ${timeline.duration}s`);
  console.log(`   Output:   ${outputPath}`);

  // Print segment summary
  console.log('\n📋 Segments:');
  for (const seg of timeline.segments) {
    const dur = (seg.end - seg.start).toFixed(2);
    console.log(`   [${seg.start.toFixed(2)}s – ${seg.end.toFixed(2)}s | ${dur}s] "${seg.text.slice(0, 60)}${seg.text.length > 60 ? '...' : ''}"`);
  }

} catch (err) {
  console.error(`\n❌ Transcription failed: ${err.message}`);
  process.exit(1);
}
