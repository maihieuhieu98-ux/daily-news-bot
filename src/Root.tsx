import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {Video, type VideoProps} from './Video';

const defaultSlug = '2026-09-10-thu-tuong-toi-new-delhi-bat-dau-chuong-trinh-';
const defaultDuration = 1110;
const defaultWidth = 1080;
const defaultHeight = 1920;

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Video"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    component={Video as any}
    durationInFrames={defaultDuration}
    fps={30}
    width={defaultWidth}
    height={defaultHeight}
    defaultProps={{slug: defaultSlug} satisfies VideoProps}
  />
);

registerRoot(RemotionRoot);
