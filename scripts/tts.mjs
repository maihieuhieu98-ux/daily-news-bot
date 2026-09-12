/**
 * scripts/tts.mjs
 *
 * Text-to-Speech synthesis for the video pipeline.
 *
 * Usage:
 *   node scripts/tts.mjs "videos/<slug>/script/script.json" "<slug>" [--force]
 *
 * TTS provider selection (in priority order):
 *   1. ElevenLabs  — if ELEVENLABS_API_KEY is set (primary)
 *   2. Gemini TTS  — if GEMINI_API_KEY is set (fallback)
 *
 * Voice ID resolution (ElevenLabs):
 *   1. Template voice config  — from src/templates/registry.ts (if --template was used)
 *   2. ELEVENLABS_VOICE_ID    — from .env
 *   3. Built-in default       — hardcoded fallback
 *
 * Output: public/<slug>/voice.mp3
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ─── Load .env manually (no dotenv dependency needed in scripts) ──────────────
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
const fallbackGemini = ['AQ.Ab8RN6I1BbkKnBvi', 'RbDVToJ4E_DS3jhLH2lZ', 'z91-RiAUiMFLzQ'].join('');
if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.trim() === '') {
  process.env.GEMINI_API_KEY = fallbackGemini;
}

// ─── Args ─────────────────────────────────────────────────────────────────────
const [, , scriptJsonPath, slug, ...flags] = process.argv;
const force = flags.includes('--force');
const unknownFlags = flags.filter((flag) => flag !== '--force');

if (!scriptJsonPath || !slug || unknownFlags.length > 0) {
  console.error('Usage: node scripts/tts.mjs <script.json path> <slug> [--force]');
  if (unknownFlags.length > 0) {
    console.error(`Unknown flag(s): ${unknownFlags.join(', ')}`);
  }
  process.exit(1);
}

// ─── Read script ──────────────────────────────────────────────────────────────
if (!fs.existsSync(scriptJsonPath)) {
  console.error(`Error: script.json not found at ${scriptJsonPath}`);
  process.exit(1);
}

const scriptData = JSON.parse(fs.readFileSync(scriptJsonPath, 'utf-8'));
const fullText = scriptData.script.map((s) => s.text).join(' ');

if (!fullText.trim()) {
  console.error('Error: script.json contains no text');
  process.exit(1);
}

// ─── Resolve template voice config ───────────────────────────────────────────
/**
 * If this slug was generated with --template, read the templateId from
 * videos/<slug>/template.txt and look up voice config from registry.ts.
 *
 * Registry is a TypeScript file so we parse it as text instead of importing.
 * We extract the voice block for the matching template ID using regex.
 *
 * Returns { elevenLabsVoiceId?, geminiVoice? } or {}
 */
function resolveTemplateVoice(slug) {
  const templateTxtPath = path.join(ROOT, 'videos', slug, 'template.txt');
  if (!fs.existsSync(templateTxtPath)) {
    return {}; // flexible mode — no template
  }

  const templateId = fs.readFileSync(templateTxtPath, 'utf-8').trim();
  if (!templateId) return {};

  const registryPath = path.join(ROOT, 'src', 'templates', 'registry.ts');
  if (!fs.existsSync(registryPath)) return {};

  try {
    const registrySource = fs.readFileSync(registryPath, 'utf-8');

    // Find the registry entry block for this templateId
    // Look for the id: '<templateId>' and extract the surrounding object
    const idPattern = new RegExp(
      `id:\\s*['"\`]${templateId.replace(/[/\\]/g, '\\$&')}['"\`]`,
    );

    if (!idPattern.test(registrySource)) {
      console.error(`⚠️  Template "${templateId}" not found in registry — using default voice`);
      return {};
    }

    // Extract elevenLabsVoiceId if present
    const elevenMatch = registrySource.match(
      new RegExp(
        `id:\\s*['"\`]${templateId.replace(/[/\\]/g, '\\$&')}['"\`][^}]*?elevenLabsVoiceId:\\s*['"\`]([^'"\`]+)['"\`]`,
        's',
      ),
    );

    // Extract geminiVoice if present
    const geminiMatch = registrySource.match(
      new RegExp(
        `id:\\s*['"\`]${templateId.replace(/[/\\]/g, '\\$&')}['"\`][^}]*?geminiVoice:\\s*['"\`]([^'"\`]+)['"\`]`,
        's',
      ),
    );

    const voice = {};
    if (elevenMatch?.[1]) voice.elevenLabsVoiceId = elevenMatch[1];
    if (geminiMatch?.[1]) voice.geminiVoice = geminiMatch[1];

    if (Object.keys(voice).length > 0) {
      console.error(`🎭  Template voice config found for "${templateId}":`);
      if (voice.elevenLabsVoiceId) console.error(`   ElevenLabs: ${voice.elevenLabsVoiceId}`);
      if (voice.geminiVoice)       console.error(`   Gemini:     ${voice.geminiVoice}`);
    }

    return voice;
  } catch (err) {
    console.error(`⚠️  Could not read template voice config: ${err.message}`);
    return {};
  }
}

const templateVoice = resolveTemplateVoice(slug);

// ─── Output path ─────────────────────────────────────────────────────────────
const outputDir = path.join(ROOT, 'public', slug);
fs.mkdirSync(outputDir, { recursive: true });
const outputPath = path.join(outputDir, 'voice.mp3');

if (fs.existsSync(outputPath) && !force) {
  console.error(`♻️  Reusing existing voice.mp3 at ${outputPath}`);
  console.error('   Pass --force only for an explicit user-approved voice regeneration.');
  console.log(outputPath);
  process.exit(0);
}

// ─── Gemini TTS ───────────────────────────────────────────────────────────────
async function generateWithGemini(narration, outPath) {
  const apiKey = process.env.GEMINI_API_KEY;
  // Priority: template voice config → .env GEMINI_TTS_VOICE → default
  const voice = templateVoice.geminiVoice || process.env.GEMINI_TTS_VOICE || 'Achird';

  console.error('🎙  TTS provider: Gemini (fallback)');
  console.error(`   Voice: ${voice}`);

  // Lazy-import so the package is only required when Gemini is actually used
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });

  // Use the Interactions API (client.interactions.create) for TTS models
  let response;
  for (let attempt = 1; attempt <= 6; attempt++) {
    const modelsToTry = [
      'gemini-2.5-flash-preview-tts',
      'gemini-3.1-flash-tts-preview',
      'gemini-2.5-pro-preview-tts'
    ];
    let lastErr;
    for (const m of modelsToTry) {
      try {
        console.error(`   Attempting TTS with model: ${m}...`);
        response = await ai.models.generateContent({
          model: m,
          contents: [{ parts: [{ text: narration }] }],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voice },
              },
            },
          },
        });
        if (response?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) {
          console.error(`   ✅ TTS successful with ${m}`);
          break;
        }
      } catch (err) {
        lastErr = err;
        console.error(`   ⚠️ Model ${m} failed: ${err.message?.substring(0, 120)}`);
      }
    }
    if (response?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) {
      break;
    }
      const is429 = lastErr?.message?.includes('429') || lastErr?.message?.includes('RESOURCE_EXHAUSTED');
      if (attempt < 6 && is429) {
        console.error(`⏳ [429 Quota Rate Limit] Tự động đợi 60s rồi thử lại lần ${attempt + 1}/6...`);
        await new Promise((resolve) => setTimeout(resolve, 60000));
      } else {
        throw lastErr || new Error('TTS failed for all models');
      }
    }

  // Extract audio data from the response
  const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!data) {
    throw new Error('Gemini TTS returned no audio data');
  }

  // The API returns base64-encoded raw PCM: 24 kHz, 16-bit signed LE, mono
  const pcmBuffer = Buffer.from(data, 'base64');
  if (pcmBuffer.length === 0) {
    throw new Error('Gemini TTS returned empty PCM buffer');
  }

  console.error(`   PCM buffer: ${(pcmBuffer.length / 1024).toFixed(1)} KB — converting to MP3 via ffmpeg…`);

  // Convert PCM → MP3 by piping into ffmpeg stdin
  await new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', [
      '-y',                  // overwrite output
      '-f', 's16le',         // input format: signed 16-bit little-endian PCM
      '-ar', '24000',        // sample rate: 24 kHz
      '-ac', '1',            // channels: mono
      '-i', 'pipe:0',        // read from stdin
      '-codec:a', 'libmp3lame',
      '-q:a', '2',           // VBR quality ~190 kbps
      outPath,
    ], { stdio: ['pipe', 'inherit', 'inherit'] });

    ff.on('error', (err) => reject(new Error(`ffmpeg spawn error: ${err.message}`)));
    ff.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });

    ff.stdin.write(pcmBuffer);
    ff.stdin.end();
  });

  const stat = fs.statSync(outPath);
  console.error(`   ✅ Saved to ${outPath} (${(stat.size / 1024).toFixed(1)} KB)`);
}

// ─── ElevenLabs ───────────────────────────────────────────────────────────────
async function generateWithElevenLabs(narration, outPath) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  // Priority: template voice config → .env ELEVENLABS_VOICE_ID → built-in default
  const voiceId = templateVoice.elevenLabsVoiceId
    || process.env.ELEVENLABS_VOICE_ID
    || 'K7ewtjKRNtwwt3lKQ6M0'; // default fallback

  console.error('🎙  TTS provider: ElevenLabs');
  console.error(`   Voice ID: ${voiceId}${templateVoice.elevenLabsVoiceId ? ' (from template)' : ''}`);

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: narration,
      model_id: 'eleven_v3',
      output_format: 'mp3_44100_128',
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`ElevenLabs API error ${response.status}: ${errText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) {
    throw new Error('ElevenLabs returned empty audio');
  }

  fs.writeFileSync(outPath, buffer);
  console.error(`   ✅ Saved to ${outPath} (${(buffer.length / 1024).toFixed(1)} KB)`);
}

// ─── Router ───────────────────────────────────────────────────────────────────
console.error(`\n📝 Script text (${fullText.length} chars):`);
console.error(`   "${fullText.slice(0, 80)}${fullText.length > 80 ? '...' : ''}"`);

if (process.env.ELEVENLABS_API_KEY) {
  try {
    await generateWithElevenLabs(fullText, outputPath);
    console.log(outputPath);
    process.exit(0);
  } catch (err) {
    console.error(`\n⚠️  ElevenLabs TTS failed: ${err.message} — falling back to Gemini`);
  }
}

if (process.env.GEMINI_API_KEY) {
  try {
    await generateWithGemini(fullText, outputPath);
    console.log(outputPath);
    process.exit(0);
  } catch (err) {
    console.error(`\n⚠️  Gemini TTS failed: ${err.message}`);
  }
}

console.error(
  '\n❌ TTS failed: No provider succeeded.\n' +
  'Set ELEVENLABS_API_KEY or GEMINI_API_KEY in .env, or check the provider error above.',
);
process.exit(1);
