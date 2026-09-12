const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

async function run() {
  try {
    // 1. Lấy tin tức VnExpress và Thời tiết
    const [newsRes, weatherRes] = await Promise.all([
      fetch('https://vnexpress.net/rss/tin-moi-nhat.rss').then(r => r.text()),
      fetch('https://api.open-meteo.com/v1/forecast?latitude=21.0285&longitude=105.8542&current=temperature_2m,relative_humidity_2m&timezone=Asia%2FBangkok').then(r => r.json())
    ]);

    // Lọc 5 tin tức mới nhất
    const items = [];
    const regex = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>/g;
    let match;
    while ((match = regex.exec(newsRes)) !== null && items.length < 5) {
      items.push({ title: match[1], link: match[2].trim() });
    }

    const temp = weatherRes.current?.temperature_2m ?? 28;
    const humidity = weatherRes.current?.relative_humidity_2m ?? 75;

    let newsText = '';
    items.forEach((item, index) => {
      newsText += `${index + 1}. ${item.title}\n🔗 ${item.link}\n\n`;
    });

    const now = new Date(Date.now() + 7 * 60 * 60 * 1000); // Giờ Việt Nam (UTC+7)
    const timeString = now.toISOString().slice(11, 16);
    const dateString = now.toLocaleDateString('vi-VN');

    const message = `📢 BẢN TIN CẬP NHẬT (${timeString} - ${dateString}) 📢\n\n` +
      `🌤️ Thời tiết: ${temp}°C | Độ ẩm: ${humidity}%\n\n` +
      `📰 TOP 5 TIN TỨC MỚI NHẤT:\n\n` +
      newsText +
      `⏱️ Tự động cập nhật 24/7 từ GitHub Cloud`;

    // 2. Gửi tin nhắn Telegram
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: message,
        disable_web_page_preview: true
      })
    });

    const data = await res.json();
    console.log('Telegram response:', data.ok ? 'Sent successfully' : data);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

run();
