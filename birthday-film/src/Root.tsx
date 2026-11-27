import React from 'react';
import {Composition} from 'remotion';
import {Film} from './Film';
import {FPS, TOTAL} from './scene.mjs';

// The film is shot at 12 exposures per second (real stop-motion cadence).
// The final MP4 is converted to 24 fps by frame doubling in scripts/finish.sh.
export const Root: React.FC = () => (
  <Composition id="BirthdayFilm" component={Film} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} />
);
