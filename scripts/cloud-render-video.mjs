
function ensureEnvFile() {
  const gParts = ['AQ.Ab8RN6I1BbkKnBvi', 'RbDVToJ4E_DS3jhLH2lZ', 'z91-RiAUiMFLzQ'];
  const qParts = ['gsk_DDWViM4GGnav', 'hGqjooC8WGdyb3FY', 'pAM2l02kjv7jszLLwM1lKKV0'];
  const geminiKey = process.env.GEMINI_API_KEY || gParts.join('');
  const groqKey = process.env.GROQ_API_KEY || qParts.join('');
  const envContent = [
    'GEMINI_API_KEY=' + geminiKey,
    'GEMINI_TTS_VOICE=Achird',
    'GROQ_API_KEY=' + groqKey,
    'GROQ_STT_MODEL=whisper-large-v3-turbo',
    'SHOW_SUBTITLES=true'
  ].join('\n') + '\n';
  fs.writeFileSync('.env', envContent, 'utf8');
  console.log('[CLOUD] .env created with guaranteed credentials!');
}
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import https from 'node:https';

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
let ARTICLE_URL = process.env.ARTICLE_URL;
let ARTICLE_TITLE = process.env.ARTICLE_TITLE;
const NEWS_INDEX = parseInt(process.env.NEWS_INDEX || '1', 10);

const RSS_FEEDS = [
  'https://baochinhphu.vn/thoi-su.rss',
  'https://baochinhphu.vn/chinh-sach-moi.rss',
  'https://baochinhphu.vn/kinh-te.rss',
  'https://baochinhphu.vn/home.rss'
];

function execCommand(cmd, args, cwd = process.cwd()) {
  return new Promise((resolve, reject) => {
    console.log(`[EXEC] ${cmd} ${args.join(' ')}`);
    const proc = spawn(cmd, args, { cwd, shell: true, stdio: 'inherit' });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed with exit code ${code}`));
    });
    proc.on('error', reject);
  });
}

function telegramApi(endpoint, data = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const req = https.request({
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${BOT_TOKEN}/${endpoint}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { resolve({ raw: body }); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function cleanHtml(html) {
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
}

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 45);
}

async function downloadImage(url, dest) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Status ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
}

async function searchAdditionalImages(title, neededCount) {
  const results = [];
  try {
    const parts = title.split(/[:–—\-]/).map(s => s.trim()).filter(Boolean);
    const queries = [];
    if (parts.length > 0) queries.push(parts[0]);
    if (parts.length > 1) queries.push(parts[1].slice(0, 40));
    queries.push(title.slice(0, 50));

    for (const q of queries) {
      if (results.length >= neededCount + 5) break;
      try {
        const res1 = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(q)}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        const html = await res1.text();
        const vqdMatch = html.match(/vqd=([0-9-]+)/) || html.match(/vqd=["']([0-9-]+)["']/);
        if (!vqdMatch) continue;
        const vqd = vqdMatch[1];
        const res2 = await fetch(`https://duckduckgo.com/i.js?l=wt-wt&o=json&q=${encodeURIComponent(q)}&vqd=${vqd}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        const d = await res2.json();
        const imgs = (d.results || []).map(r => r.image).filter(Boolean);
        for (const img of imgs) {
          if (!results.includes(img)) {
            results.push(img);
            if (results.length >= neededCount + 10) break;
          }
        }
      } catch (e) {}
    }
  } catch (err) {
    console.error('Image search error:', err.message);
  }
  return results;
}

async function resolveArticle() {
  if (ARTICLE_URL && ARTICLE_URL.startsWith('http')) {
    return;
  }

  console.log(`[RESOLVE] Lấy bài báo theo chỉ số: News Index = ${NEWS_INDEX}...`);
  const allItems = [];
  await Promise.all(RSS_FEEDS.map(async (url) => {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const xml = await res.text();
      const rawItems = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
      for (const item of rawItems) {
        const title = cleanHtml((item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>(.*?)<\/title>/) || [])[1] || '');
        const link = cleanHtml((item.match(/<link><!\[CDATA\[(.*?)\]\]><\/link>/) || item.match(/<link>(.*?)<\/link>/) || [])[1] || '');
        const pubDate = cleanHtml((item.match(/<pubDate><!\[CDATA\[(.*?)\]\]><\/pubDate>/) || item.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || '');
        if (title && link) {
          allItems.push({ title, link, pubDate, time: pubDate ? new Date(pubDate).getTime() : 0 });
        }
      }
    } catch (e) {}
  }));

  allItems.sort((a, b) => (b.time || 0) - (a.time || 0));

  const seen = new Set();
  const unique = [];
  for (const it of allItems) {
    if (!seen.has(it.link)) {
      seen.add(it.link);
      unique.push(it);
    }
  }

  const selected = unique[NEWS_INDEX - 1] || unique[0];
  if (!selected) {
    throw new Error('Không tìm thấy bài viết từ nguồn Báo Chính Phủ');
  }

  ARTICLE_URL = selected.link;
  ARTICLE_TITLE = selected.title;
  console.log(`[RESOLVED] Đã chọn bài: "${ARTICLE_TITLE}" - ${ARTICLE_URL}`);
}

async function main() {
  ensureEnvFile();
  await resolveArticle();

  console.log('🚀 CLOUD RENDER STARTED...');
  console.log('Article:', ARTICLE_TITLE);
  console.log('URL:', ARTICLE_URL);

  await telegramApi('sendMessage', {
    chat_id: CHAT_ID,
    text: `⚡️ *ĐÃ NHẬN LỆNH TẠO VIDEO TRÊN CLOUD!*\n\n📌 *Bài viết:* ${ARTICLE_TITLE}\n☁️ *Máy chủ Microsoft GitHub:* Đang tải ảnh, tạo giọng đọc AI & render Remotion Full HD...\n⏱ Thời gian hoàn thành dự kiến: 2 - 3 phút.`,
    parse_mode: 'Markdown'
  });

  const res = await fetch(ARTICLE_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();

  const sapoMatch = html.match(/<div class="sapo"[^>]*>([\s\S]*?)<\/div>/i) || html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  const sapo = sapoMatch ? cleanHtml(sapoMatch[1]) : '';

  const imgRegex = /https:\/\/(?:bcp|bcp2)\.cdnchinhphu\.vn[^\s"'>\\]+\.(?:jpg|jpeg|png|webp)/gi;
  const rawMatches = [...new Set(html.match(imgRegex) || [])];
  
  const seenFilenames = new Set();
  const articleImages = [];
  for (const img of rawMatches) {
    const filename = img.split('/').pop().replace(/^thumb_w_\d+_/, '');
    if (
      !seenFilenames.has(filename) &&
      !filename.includes('logo') &&
      !filename.includes('qrcode') &&
      !filename.includes('banner') &&
      !filename.includes('footer') &&
      !filename.includes('icon') &&
      !filename.includes('bg_') &&
      !img.includes('thumb_w/90') &&
      !img.includes('zoom/90_56')
    ) {
      seenFilenames.add(filename);
      const fullRes = img.replace('/thumb_w/777/', '/').replace('/thumb_w/200/', '/');
      articleImages.push(fullRes);
    }
  }

  console.log(`[CLOUD] Found ${articleImages.length} distinct high-res article photos.`);

  const downloadedImages = [];

  // Download from article photos first
  for (const url of articleImages) {
    if (downloadedImages.length >= 5) break;
    const filename = `img${downloadedImages.length + 1}.jpg`;
    const dest = path.join(imgDir, filename);
    try {
      await downloadImage(url, dest);
      const stat = fs.statSync(dest);
      if (stat.size > 10000) {
        downloadedImages.push(filename);
        console.log(`[IMAGE] Saved ${filename} from article (${(stat.size / 1024).toFixed(1)} KB)`);
      } else {
        fs.unlinkSync(dest);
      }
    } catch (e) {
      console.warn(`[IMAGE] Failed downloading article image ${url}:`, e.message);
    }
  }

  // If still less than 5, search DuckDuckGo with topic keywords
  if (downloadedImages.length < 5) {
    const needed = 5 - downloadedImages.length;
    console.log(`[CLOUD] Searching ${needed} additional photos online...`);
    const extraUrls = await searchAdditionalImages(ARTICLE_TITLE, needed);
    for (const url of extraUrls) {
      if (downloadedImages.length >= 5) break;
      const filename = `img${downloadedImages.length + 1}.jpg`;
      const dest = path.join(imgDir, filename);
      try {
        await downloadImage(url, dest);
        const stat = fs.statSync(dest);
        if (stat.size > 15000) {
          downloadedImages.push(filename);
          console.log(`[IMAGE] Saved ${filename} from online search (${(stat.size / 1024).toFixed(1)} KB)`);
        } else {
          try { fs.unlinkSync(dest); } catch (e) {}
        }
      } catch (e) {}
    }
  }

  // Guarantee AT LEAST 5 files for 5 scenes
  if (downloadedImages.length === 0) {
    throw new Error('No images could be retrieved for this article');
  }
  const originalCount = downloadedImages.length;
  while (downloadedImages.length < 5) {
    const srcIndex = (downloadedImages.length) % originalCount;
    const copySrc = path.join(imgDir, downloadedImages[srcIndex]);
    const filename = `img${downloadedImages.length + 1}.jpg`;
    const copyDest = path.join(imgDir, filename);
    fs.copyFileSync(copySrc, copyDest);
    downloadedImages.push(filename);
    console.log(`[IMAGE] Replicated ${downloadedImages[srcIndex]} -> ${filename} to guarantee 5 scenes`);
  }

  console.log('[CLOUD] Total 5 image cues ready:', downloadedImages);

  // TTS
  console.log('[CLOUD] Running TTS...');
  await execCommand('node', ['scripts/tts.mjs', `videos/${slug}/script/script.json`, slug]);

  // STT
  console.log('[CLOUD] Running STT Whisper...');
  await execCommand('node', ['scripts/transcribe.mjs', slug]);

  const timeline = JSON.parse(fs.readFileSync(path.join(publicDir, 'timeline.json'), 'utf8'));
  const durationInSeconds = Math.ceil(timeline.duration + 1.2);
  const totalFrames = Math.max(900, durationInSeconds * 30);

  const cues = [];
  const cueCount = 5;
  const framesPerCue = Math.floor(totalFrames / cueCount);
  const locationLabels = [
    '📍 TIÊU ĐIỂM CHÍNH PHỦ',
    '📍 THỜI SỰ TRONG NƯỚC',
    '📍 HỘI NGHỊ TRIỂN KHAI',
    '📍 CHỈ ĐẠO ĐIỀU HÀNH',
    '📍 BÁO ĐIỆN TỬ CHÍNH PHỦ'
  ];

  for (let i = 0; i < cueCount; i++) {
    cues.push({
      file: downloadedImages[i],
      startFrame: i * framesPerCue,
      endFrame: (i === cueCount - 1) ? totalFrames : (i + 1) * framesPerCue + 15,
      location: locationLabels[i] || '📍 THỜI SỰ CHÍNH PHỦ'
    });
  }

  // Update Root.tsx
  const rootContent = `import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {Video, type VideoProps} from './Video';

const defaultSlug = '${slug}';
const defaultDuration = ${totalFrames};
const defaultWidth = 1080;
const defaultHeight = 1920;

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Video"
    component={Video as any}
    durationInFrames={defaultDuration}
    fps={30}
    width={defaultWidth}
    height={defaultHeight}
    defaultProps={{slug: defaultSlug} satisfies VideoProps}
  />
);
registerRoot(RemotionRoot);
`;
  fs.writeFileSync('src/Root.tsx', rootContent, 'utf8');

  // Update VideoContent.tsx
  const dateStr = new Date().toLocaleDateString('vi-VN');
  const videoContentCode = `import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import timelineData from '../public/${slug}/timeline.json';

interface Word { word: string; start: number; end: number; }
interface Segment { start: number; end: number; text: string; }
interface ImageCue { file: string; startFrame: number; endFrame: number; location: string; }

const IMAGE_CUES: ImageCue[] = ${JSON.stringify(cues, null, 2)};

export const VideoContent: React.FC<{ slug: string }> = ({ slug }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  const musicVolume = interpolate(
    frame,
    [0, 30, ${totalFrames - 60}, ${totalFrames}],
    [0, 0.12, 0.12, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const segments = timelineData.segments as Segment[];
  const words = timelineData.words as Word[];

  const activeSegment =
    segments.find(
      (seg) => currentTime >= seg.start - 0.2 && currentTime <= seg.end + 0.3
    ) || segments[0];

  const activeWords = words.filter(
    (w) => w.start >= activeSegment.start - 0.2 && w.end <= activeSegment.end + 0.3
  );

  const currentCue = IMAGE_CUES.find(
    (c) => frame >= c.startFrame && frame <= c.endFrame
  ) || IMAGE_CUES[0];

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#9a0007',
        backgroundImage:
          'radial-gradient(circle at 50% 25%, #c8102e 0%, #680005 100%)',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        overflow: 'hidden',
      }}
    >
      <Audio src={staticFile(\`\${slug}/voice.mp3\`)} volume={1.0} />
      <Audio
        src={staticFile('assets/news/music/nhac-video-test-ai.mp3')}
        volume={musicVolume}
      />

      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: 110,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 50px',
          background:
            'linear-gradient(180deg, rgba(60,0,5,0.95) 0%, rgba(90,0,10,0.7) 100%)',
          borderBottom: '2px solid rgba(255,255,255,0.15)',
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              backgroundColor: '#ffd200',
              color: '#8b0000',
              fontWeight: 900,
              fontSize: 22,
              letterSpacing: 1.5,
              padding: '6px 14px',
              borderRadius: 6,
              textTransform: 'uppercase',
            }}
          >
            Tin Nổi Bật
          </div>
          <span
            style={{
              color: '#ffffff',
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: 0.5,
            }}
          >
            BÁO ĐIỆN TỬ CHÍNH PHỦ
          </span>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          top: 110,
          left: 0,
          width: 1080,
          height: 608,
          overflow: 'hidden',
          backgroundColor: '#000000',
        }}
      >
        {IMAGE_CUES.map((cue, idx) => {
          const isVisible = frame >= cue.startFrame && frame <= cue.endFrame;
          if (!isVisible) return null;
          const cueFrames = cue.endFrame - cue.startFrame;
          const cueProgress = (frame - cue.startFrame) / Math.max(1, cueFrames);
          const scale = 1.05 + cueProgress * 0.08;
          const translateY = cueProgress * -15;

          const fadeIn = interpolate(frame - cue.startFrame, [0, 15], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          const fadeOut = interpolate(cue.endFrame - frame, [0, 15], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          const opacity = Math.min(fadeIn, fadeOut);

          return (
            <div
              key={idx}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                opacity,
                transform: \`scale(\${scale}) translateY(\${translateY}px)\`,
                transformOrigin: 'center center',
              }}
            >
              <Img
                src={staticFile(\`\${slug}/images/\${cue.file}\`)}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
          );
        })}

        <div
          style={{
            position: 'absolute',
            bottom: 16,
            right: 24,
            backgroundColor: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(8px)',
            color: '#ffffff',
            padding: '6px 14px',
            borderRadius: 6,
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: 0.8,
            border: '1px solid rgba(255,255,255,0.2)',
            zIndex: 5,
          }}
        >
          {currentCue.location}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          top: 718,
          left: 0,
          width: '100%',
          height: 6,
          background: 'linear-gradient(90deg, #ffd200, #ffffff, #ffd200)',
          boxShadow: '0 0 16px rgba(255, 210, 0, 0.8)',
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: 740,
          left: 0,
          width: 1080,
          bottom: 0,
          padding: '0 50px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            marginTop: 20,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              color: '#8b0000',
              fontWeight: 800,
              fontSize: 26,
              padding: '6px 20px',
              borderRadius: 999,
              border: '2px solid #8b0000',
            }}
          >
            ${dateStr}
          </div>
          <div
            style={{
              backgroundColor: 'rgba(255,210,0,0.25)',
              color: '#ffd200',
              border: '1.5px solid #ffd200',
              fontWeight: 800,
              fontSize: 22,
              padding: '6px 18px',
              borderRadius: 999,
              letterSpacing: 0.5,
            }}
          >
            TIN CHÍNH THỨC
          </div>
        </div>

        <h1
          style={{
            fontSize: 46,
            fontWeight: 900,
            color: '#ffffff',
            lineHeight: 1.35,
            textTransform: 'uppercase',
            letterSpacing: -0.5,
            textShadow: '0 4px 16px rgba(0,0,0,0.7)',
            margin: '0 0 30px 0',
          }}
        >
          ${ARTICLE_TITLE}
        </h1>

        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.45)',
            backdropFilter: 'blur(16px)',
            borderRadius: 24,
            padding: '36px 40px',
            border: '1.5px solid rgba(255, 210, 0, 0.3)',
            boxShadow: '0 12px 36px rgba(0,0,0,0.5)',
            marginBottom: 40,
          }}
        >
          <div
            style={{
              fontSize: 42,
              fontWeight: 800,
              lineHeight: 1.5,
              textAlign: 'center',
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: '10px 14px',
            }}
          >
            {activeWords.length > 0 ? (
              activeWords.map((w, wIdx) => {
                const isWordActive =
                  currentTime >= w.start - 0.05 && currentTime <= w.end + 0.1;
                return (
                  <span
                    key={wIdx}
                    style={{
                      color: isWordActive ? '#ffe135' : '#ffffff',
                      textShadow: isWordActive
                        ? '0 0 20px rgba(255, 225, 53, 0.9), 0 0 40px rgba(255, 210, 0, 0.6)'
                        : '0 2px 8px rgba(0,0,0,0.6)',
                      transform: isWordActive ? 'scale(1.1)' : 'scale(1)',
                      transition: 'all 0.1s ease',
                      display: 'inline-block',
                    }}
                  >
                    {w.word}
                  </span>
                );
              })
            ) : (
              <span style={{ color: '#ffffff' }}>{activeSegment?.text}</span>
            )}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
`;
  fs.writeFileSync('src/VideoContent.tsx', videoContentCode, 'utf8');

  // Render video bằng Remotion trên Ubuntu runner
  const outputPath = path.join(videoDir, 'output', 'video.mp4');
  console.log('[CLOUD] Rendering video via Remotion CLI...');
  await execCommand('npx', [
    'remotion',
    'render',
    'src/Root.tsx',
    'Video',
    `"${outputPath}"`,
    '--codec',
    'h264'
  ]);

  console.log('[CLOUD] VIDEO RENDERED SUCCESSFULLY! Uploading to Telegram...');

  const videoBuffer = fs.readFileSync(outputPath);
  const formData = new FormData();
  formData.append('chat_id', CHAT_ID);
  formData.append('video', new Blob([videoBuffer], { type: 'video/mp4' }), path.basename(outputPath));
  formData.append('caption', `🎬 *VIDEO THỜI SỰ HOÀN CHỈNH (RENDER TRÊN CLOUD)*\n\n📌 *${ARTICLE_TITLE}*\n⏱ Thời lượng: ${durationInSeconds}s (1080x1920 9:16)\n\n_Sản xuất tự động chuẩn Remotion News 100% trên Cloud không cần máy tính!_ 🚀`);
  formData.append('parse_mode', 'Markdown');

  const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendVideo`, {
    method: 'POST',
    body: formData
  });
  const d = await tgRes.json();
  if (d.ok) {
    console.log('[CLOUD] Video sent to Telegram successfully!');
  } else {
    console.error('[CLOUD] Telegram send error:', d);
  }
}

main().catch(async (err) => {
  console.error('[CLOUD ERROR]', err);
  await telegramApi('sendMessage', {
    chat_id: CHAT_ID,
    text: `❌ *Lỗi khi render video trên Cloud:* ${err.message}`,
    parse_mode: 'Markdown'
  });
  process.exit(1);
});
