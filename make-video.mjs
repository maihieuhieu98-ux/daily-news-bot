import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const BOT_TOKEN = process.env.BOT_TOKEN || '8698501967:AAHXvGTlP5-qMRmOIkdK-hLhaoSp3mKU39A';
const CHAT_ID = process.env.CHAT_ID || '6716771282';
const NEWS_INDEX = parseInt(process.env.NEWS_INDEX || '1', 10);

async function downloadFile(url, dest) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buffer);
}

// Hàm chia văn bản thành các đoạn ngắn cho Google TTS (tối đa 200 ký tự mỗi đoạn)
async function generateTTS(text, outputFile) {
  const cleanText = text.replace(/<[^>]*>/g, '').replace(/[^\p{L}\p{N}\s,.-]/gu, ' ').trim();
  const sentences = cleanText.split(/([.,\n]+)/).filter(s => s.trim().length > 0);
  
  const chunks = [];
  let currentChunk = '';
  for (const s of sentences) {
    if ((currentChunk + ' ' + s).length < 180) {
      currentChunk += (currentChunk ? ' ' : '') + s;
    } else {
      if (currentChunk) chunks.push(currentChunk);
      currentChunk = s;
    }
  }
  if (currentChunk) chunks.push(currentChunk);

  const audioBuffers = [];
  for (const chunk of chunks.slice(0, 4)) { // Tối đa 4 câu cho video ngắn súc tích ~15-20s
    const url = 'https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=' + encodeURIComponent(chunk);
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (res.ok) {
      audioBuffers.push(Buffer.from(await res.arrayBuffer()));
    }
  }

  const combined = Buffer.concat(audioBuffers);
  fs.writeFileSync(outputFile, combined);
}

async function main() {
  console.log(`🎬 Bắt đầu tạo video cho Tin số ${NEWS_INDEX}...`);

  // 1. Lấy tin từ RSS VnExpress
  const rssRes = await fetch('https://vnexpress.net/rss/tin-moi-nhat.rss');
  const rssText = await rssRes.text();

  const items = [];
  const regex = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>[\s\S]*?<link>(.*?)<\/link>/g;
  let match;
  while ((match = regex.exec(rssText)) !== null) {
    const title = match[1].trim();
    const rawDesc = match[2].trim();
    const link = match[3].trim();

    // Lấy ảnh thumbnail từ description
    const imgMatch = rawDesc.match(/<img[^>]+src="([^">]+)"/);
    const imageUrl = imgMatch ? imgMatch[1] : null;

    // Lấy nội dung text sạch
    const descText = rawDesc.replace(/<[^>]*>/g, '').trim();

    items.push({ title, descText, imageUrl, link });
  }

  const selectedItem = items[NEWS_INDEX - 1] || items[0];
  console.log(`📌 Tiêu đề: ${selectedItem.title}`);

  const workDir = path.resolve('tmp-make-video');
  if (!fs.existsSync(workDir)) fs.mkdirSync(workDir, { recursive: true });

  const imagePath = path.join(workDir, 'image.jpg');
  const audioPath = path.join(workDir, 'audio.mp3');
  const videoPath = path.join(workDir, 'output.mp4');

  // 2. Tải ảnh
  if (selectedItem.imageUrl) {
    console.log(`📥 Tải ảnh minh họa: ${selectedItem.imageUrl}`);
    await downloadFile(selectedItem.imageUrl, imagePath);
  } else {
    // Tạo ảnh nền đơn giản nếu bài báo không có ảnh
    spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=0x1a1a2e:s=1080x1080:d=1', '-vframes', '1', imagePath]);
  }

  // 3. Tạo giọng đọc
  console.log(`🎙️ Đang tạo giọng đọc AI tiếng Việt...`);
  const narration = `${selectedItem.title}. ${selectedItem.descText}`;
  await generateTTS(narration, audioPath);

  // 4. Render Video bằng FFMPEG (chuẩn dọc 1080x1920 cho TikTok/Shorts/Reels)
  console.log(`⚙️ Đang render video chuẩn 9:16...`);
  
  // Tạo filter phức hợp: Background mờ + Ảnh sắc nét ở giữa
  const ffmpegArgs = [
    '-y',
    '-loop', '1',
    '-i', imagePath,
    '-i', audioPath,
    '-filter_complex',
    '[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:5[bg];' +
    '[0:v]scale=1000:-1[fg];' +
    '[bg][fg]overlay=(W-w)/2:(H-h)/2[v]',
    '-map', '[v]',
    '-map', '1:a',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-tune', 'stillimage',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-shortest',
    videoPath
  ];

  const ffRes = spawnSync('ffmpeg', ffmpegArgs, { stdio: 'inherit' });
  if (ffRes.status !== 0) {
    throw new Error('Lỗi render video FFMPEG');
  }

  console.log(`✅ Render video thành công! File: ${videoPath}`);

  // 5. Gửi video vào Telegram
  console.log(`🚀 Đang gửi video về Telegram (${CHAT_ID})...`);
  const videoBuffer = fs.readFileSync(videoPath);
  const formData = new FormData();
  formData.append('chat_id', CHAT_ID);
  
  const videoBlob = new Blob([videoBuffer], { type: 'video/mp4' });
  formData.append('video', videoBlob, 'news-video.mp4');
  formData.append('caption', `🎬 *VIDEO TIN TỨC TỰ ĐỘNG*\n\n📰 *${selectedItem.title}*\n\n🔗 Nguồn: ${selectedItem.link}\n\n_Video được sản xuất tự động hoàn toàn bởi AI trên Cloud!_ 🚀`);
  formData.append('parse_mode', 'Markdown');

  const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendVideo`, {
    method: 'POST',
    body: formData
  });

  const tgData = await tgRes.json();
  if (tgData.ok) {
    console.log(`🎉 ĐÃ GỬI VIDEO THÀNH CÔNG VÀO TELEGRAM CỦA BẠN!`);
  } else {
    console.error('Lỗi gửi video Telegram:', tgData);
  }

  // Dọn dẹp
  fs.rmSync(workDir, { recursive: true, force: true });
}

main().catch(err => {
  console.error('Lỗi quy trình:', err);
  process.exit(1);
});
