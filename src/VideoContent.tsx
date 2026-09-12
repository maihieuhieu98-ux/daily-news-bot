import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import timelineData from '../public/2026-09-10-thu-tuong-toi-new-delhi-bat-dau-chuong-trinh-/timeline.json';

interface Word {
  word: string;
  start: number;
  end: number;
}

interface Segment {
  start: number;
  end: number;
  text: string;
}

interface ImageCue {
  file: string;
  startFrame: number;
  endFrame: number;
  location: string;
}

const IMAGE_CUES: ImageCue[] = [
  {
    "file": "img1.jpg",
    "startFrame": 0,
    "endFrame": 237,
    "location": "📍 THỜI SỰ CHÍNH PHỦ"
  },
  {
    "file": "img2.jpg",
    "startFrame": 222,
    "endFrame": 459,
    "location": "📍 THỜI SỰ CHÍNH PHỦ"
  },
  {
    "file": "img3.jpg",
    "startFrame": 444,
    "endFrame": 681,
    "location": "📍 THỜI SỰ CHÍNH PHỦ"
  },
  {
    "file": "img4.jpg",
    "startFrame": 666,
    "endFrame": 903,
    "location": "📍 THỜI SỰ CHÍNH PHỦ"
  },
  {
    "file": "img5.jpg",
    "startFrame": 888,
    "endFrame": 1110,
    "location": "📍 THỜI SỰ CHÍNH PHỦ"
  }
];

export const VideoContent: React.FC<{ slug: string }> = ({ slug }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  const musicVolume = interpolate(
    frame,
    [0, 30, 1050, 1110],
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
      <Audio src={staticFile(`${slug}/voice.mp3`)} volume={1.0} />
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

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: '#ffd200',
            fontSize: 20,
            fontWeight: 700,
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              backgroundColor: '#ffd200',
              boxShadow: '0 0 10px #ffd200',
            }}
          />
          THỜI SỰ CHÍNH TRỊ
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          top: 110,
          left: 0,
          width: 1080,
          height: 608,
          backgroundColor: '#000',
          overflow: 'hidden',
          boxShadow: '0 12px 30px rgba(0,0,0,0.5)',
        }}
      >
        {IMAGE_CUES.map((cue, idx) => {
          if (frame < cue.startFrame - 15 || frame > cue.endFrame + 15) {
            return null;
          }

          const localProgress = (frame - cue.startFrame) / Math.max(1, (cue.endFrame - cue.startFrame));
          const scale = interpolate(localProgress, [0, 1], [1.0, 1.08], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          const translateY = interpolate(localProgress, [0, 1], [0, -10], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });

          let opacity = 1;
          if (frame < cue.startFrame) {
            opacity = interpolate(frame, [cue.startFrame - 15, cue.startFrame], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
          } else if (frame > cue.endFrame - 15 && idx < IMAGE_CUES.length - 1) {
            opacity = interpolate(frame, [cue.endFrame - 15, cue.endFrame], [1, 0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
          }

          return (
            <div
              key={cue.file}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                opacity,
                transform: `scale(${scale}) translateY(${translateY}px)`,
                transformOrigin: 'center center',
              }}
            >
              <Img
                src={staticFile(`${slug}/images/${cue.file}`)}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
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
            12/9/2026
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
            ★ TIN NÓNG CHÍNH PHỦ
          </div>
        </div>

        <div
          style={{
            fontSize: 47,
            fontWeight: 900,
            lineHeight: 1.32,
            color: '#ffe135',
            textShadow:
              '3px 3px 0 #000, -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000, 0 6px 16px rgba(0,0,0,0.6)',
            marginBottom: 36,
            letterSpacing: -0.5,
          }}
        >
          Thủ tướng tới New Delhi, bắt đầu chương trình dự Hội nghị thượng đỉnh BRICS và làm việc song phương tại Ấn Độ
        </div>

        <div
          style={{
            backgroundColor: 'rgba(50, 0, 8, 0.85)',
            border: '1.5px solid rgba(255, 210, 0, 0.3)',
            borderRadius: 24,
            padding: '30px 36px',
            backdropFilter: 'blur(16px)',
            boxShadow: '0 15px 35px rgba(0,0,0,0.5)',
            marginTop: 'auto',
            marginBottom: 110,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              color: '#ffd200',
              fontSize: 20,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 1.2,
              marginBottom: 16,
            }}
          >
            <span>●</span> THÔNG TIN CHÍNH THỐNG
          </div>

          <div
            style={{
              fontSize: 35,
              fontWeight: 700,
              lineHeight: 1.45,
              color: '#ffffff',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px 12px',
            }}
          >
            {activeWords.length > 0 ? (
              activeWords.map((w, i) => {
                const isCurrent =
                  currentTime >= w.start && currentTime <= w.end;
                const isPast = currentTime > w.end;

                return (
                  <span
                    key={i}
                    style={{
                      color: isCurrent
                        ? '#ffe135'
                        : isPast
                        ? '#ffffff'
                        : 'rgba(255,255,255,0.55)',
                      backgroundColor: isCurrent
                        ? 'rgba(255,225,53,0.2)'
                        : 'transparent',
                      padding: '2px 6px',
                      borderRadius: 6,
                      transform: isCurrent ? 'scale(1.06)' : 'scale(1)',
                      transition: 'all 0.1s ease',
                      display: 'inline-block',
                      textShadow: isCurrent
                        ? '0 0 12px rgba(255,225,53,0.6)'
                        : 'none',
                    }}
                  >
                    {w.word}
                  </span>
                );
              })
            ) : (
              <span>{activeSegment?.text || ''}</span>
            )}
          </div>
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: 30,
            left: 50,
            right: 50,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTop: '1px solid rgba(255,255,255,0.2)',
            paddingTop: 16,
            fontSize: 20,
            color: 'rgba(255,255,255,0.8)',
            fontWeight: 600,
          }}
        >
          <span>Nguồn: Báo Điện tử Chính phủ (baochinhphu.vn)</span>
          <span>Cổng Thông tin điện tử Chính phủ</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
