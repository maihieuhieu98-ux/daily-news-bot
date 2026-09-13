import fs from 'node:fs';
import path from 'node:path';

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const RSS_FEEDS = [
  'https://baochinhphu.vn/thoi-su.rss',
  'https://baochinhphu.vn/chinh-sach-moi.rss',
  'https://baochinhphu.vn/kinh-te.rss',
  'https://baochinhphu.vn/home.rss'
];

function cleanHtml(html) {
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
}

async function run() {
  console.log('🤖 SCANNING REAL-TIME NEWS ON GITHUB CLOUD (24/7)...');
  try {
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

    const topItems = unique.slice(0, 5);
    console.log(`Found ${topItems.length} top articles.`);

    const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const timeStr = now.toISOString().slice(11, 16);
    const dateStr = now.toLocaleDateString('vi-VN');

    let textList = '';
    topItems.forEach((it, idx) => {
      textList += `${idx + 1}. *${it.title}*\n🔗 [Đọc bài viết](${it.link})\n\n`;
    });

    const message = `⚡️ *BẢN TIN BÁO CHÍNH PHỦ THỜI GIAN THỰC (CLOUD 24/7)*\n\n` +
      `⏰ *Cập nhật:* ${timeStr} - ${dateStr}\n\n` +
      `📌 *TOP 5 TIN TỨC MỚI NHẤT VỪA ĐĂNG TẢI:*\n\n` +
      textList +
      `🎬 *CÁCH TẠO VIDEO TRỰC TIẾP TRÊN ĐIỆN THOẠI:*\n` +
      `• Nhấn trực tiếp nút *[🎬 Tạo video bài 1..5]* bên dưới\n` +
      `• Hoặc gõ số *1*, *2*, *3*, *4*, *5* gửi tin nhắn cho bot\n` +
      `• Hoặc gửi bất kỳ link bài báo nào vào đây để làm video!`;

    const controllerUrl = 'https://maihieuhieu98-ux.github.io/daily-news-bot/';

    const inline_keyboard = [
      [
        { text: '🎬 Tạo bài 1', callback_data: 'make_video_index_1' },
        { text: '🎬 Tạo bài 2', callback_data: 'make_video_index_2' }
      ],
      [
        { text: '🎬 Tạo bài 3', callback_data: 'make_video_index_3' },
        { text: '🎬 Tạo bài 4', callback_data: 'make_video_index_4' }
      ],
      [
        { text: '🎬 Tạo bài 5', callback_data: 'make_video_index_5' }
      ],
      [
        { text: '⚡️ Quét tin tức mới ngay', url: controllerUrl },
        { text: '🌐 Mở Bảng Điều Khiển Web', url: controllerUrl }
      ]
    ];

    const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: message,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard
        }
      })
    });

    const d = await tgRes.json();
    console.log('Telegram sent:', d.ok);
  } catch (err) {
    console.error('Error in cloud reporter:', err);
    process.exit(1);
  }
}

run();
