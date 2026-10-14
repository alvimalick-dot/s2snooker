'use client';

import { useId } from 'react';

export type TableBall = { id: string; color: keyof typeof BALL_COLORS; x: number; y: number };

export const BALL_COLORS = {
  red: '#c8262b',
  yellow: '#f2c230',
  green: '#1f8a4c',
  brown: '#7a4a26',
  blue: '#2d6fd2',
  pink: '#ef8fb0',
  black: '#111111',
  white: '#f4efe0',
} as const;

const reds = (axisX: number, centerY: number): TableBall[] => {
  const balls: TableBall[] = [];
  let index = 0;
  for (let row = 0; row < 5; row += 1) {
    for (let offset = 0; offset <= row; offset += 1) {
      balls.push({ id: `red-${index++}`, color: 'red', x: axisX + row * 8.4, y: centerY + (offset - row / 2) * 9.4 });
    }
  }
  return balls;
};

export const RACKED_BALLS: TableBall[] = [
  ...reds(292, 110),
  { id: 'yellow', color: 'yellow', x: 110, y: 145 },
  { id: 'green', color: 'green', x: 110, y: 75 },
  { id: 'brown', color: 'brown', x: 110, y: 110 },
  { id: 'blue', color: 'blue', x: 200, y: 110 },
  { id: 'pink', color: 'pink', x: 282, y: 110 },
  { id: 'black', color: 'black', x: 345, y: 110 },
  { id: 'white', color: 'white', x: 95, y: 128 },
];

const SCATTERED_POSITIONS: [number, number][] = [
  [240, 70], [262, 132], [300, 90], [318, 150], [210, 160], [180, 64], [330, 60], [285, 170],
  [250, 105], [150, 150], [345, 135], [228, 52], [305, 118], [195, 128], [270, 58],
];

export const SCATTERED_BALLS: TableBall[] = RACKED_BALLS.map((ball, index) => (
  ball.color === 'red'
    ? { ...ball, x: SCATTERED_POSITIONS[index][0], y: SCATTERED_POSITIONS[index][1] }
    : ball.id === 'white'
      ? { ...ball, x: 168, y: 98 }
      : ball.id === 'pink'
        ? { ...ball, x: 262, y: 92 }
        : ball
));

export default function TableArt({
  balls = RACKED_BALLS,
  cue = 'rail',
  chalk = false,
  luxe = false,
  className = '',
}: {
  balls?: TableBall[];
  cue?: 'rail' | 'aim' | 'none';
  chalk?: boolean;
  luxe?: boolean;
  className?: string;
}) {
  const rawId = useId();
  const uid = rawId.replace(/:/g, '');
  const railId = `rail-${uid}`;
  const baizeId = `baize-${uid}`;
  const ballshineId = `ballshine-${uid}`;

  return (
    <svg viewBox="0 0 400 220" className={className} role="img" aria-label="Top-down snooker table">
      <defs>
        <linearGradient id={railId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={luxe ? '#6c3c25' : '#6b3a22'} />
          <stop offset="0.5" stopColor={luxe ? '#2a1610' : '#3a1f14'} />
          <stop offset="1" stopColor="#1c0e08" />
        </linearGradient>
        <radialGradient id={baizeId} cx="0.5" cy="0.5" r="0.7">
          <stop offset="0" stopColor="#0f7448" />
          <stop offset="0.7" stopColor="#0b5d3b" />
          <stop offset="1" stopColor="#07351f" />
        </radialGradient>
        <radialGradient id={ballshineId} cx="0.35" cy="0.3" r="0.7">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="0.25" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.35" />
        </radialGradient>
        <pattern id={`grain-${uid}`} width="40" height="6" patternUnits="userSpaceOnUse">
          <path d="M0 3 Q10 1 20 3 T40 3" stroke="#000" strokeOpacity=".22" fill="none" strokeWidth=".8" />
        </pattern>
      </defs>
      <rect x="2" y="2" width="396" height="216" rx="16" fill={`url(#${railId})`} />
      <rect x="2" y="2" width="396" height="216" rx="16" fill={`url(#grain-${uid})`} />
      {luxe && <rect x="6" y="6" width="388" height="208" rx="13" fill="none" stroke="#c9a24b" strokeWidth="1.5" strokeDasharray="1 5" strokeLinecap="round" />}
      {[[60, 2], [140, 2], [260, 2], [340, 2], [60, 214], [140, 214], [260, 214], [340, 214]].map(([x, y], index) => (
        <circle key={index} cx={x} cy={y + (y > 100 ? -2 : 6)} r="2.2" fill="#e8c97a" opacity=".85" />
      ))}
      <rect x="24" y="24" width="352" height="172" rx="3" fill="#0a4a2f" />
      <rect x="30" y="30" width="340" height="160" fill={`url(#${baizeId})`} />
      <line x1="110" y1="30" x2="110" y2="190" stroke="#f4efe0" strokeOpacity=".55" strokeWidth="1" />
      <path d="M110 75 A35 35 0 0 0 110 145" fill="none" stroke="#f4efe0" strokeOpacity=".55" strokeWidth="1" />
      {[[110, 110], [110, 75], [110, 145], [200, 110], [282, 110], [345, 110]].map(([x, y], index) => (
        <circle key={index} cx={x} cy={y} r="1.3" fill="#f4efe0" opacity=".6" />
      ))}
      {[[26, 26], [200, 22], [374, 26], [26, 194], [200, 198], [374, 194]].map(([x, y], index) => (
        <g key={index}><circle cx={x} cy={y} r="11" fill="#c9a24b" opacity=".55" /><circle cx={x} cy={y} r="9" fill="#050505" /></g>
      ))}
      {chalk && <g transform="translate(56 160) rotate(-12)"><rect width="10" height="10" rx="1.5" fill="#3b7fd6" /><rect x="2" y="2" width="6" height="6" fill="#6aa6ee" /></g>}
      {balls.map((ball) => (
        <g key={ball.id} style={{ transform: `translate(${ball.x}px, ${ball.y}px)`, transition: 'transform 900ms cubic-bezier(.2,.8,.2,1)' }}>
          <ellipse cx="1.6" cy="2.4" rx="4.6" ry="3.6" fill="#000" opacity=".35" />
          <circle r="4.4" fill={BALL_COLORS[ball.color]} />
          <circle r="4.4" fill={`url(#${ballshineId})`} />
        </g>
      ))}
      {cue === 'rail' && <g><line x1="40" y1="207" x2="330" y2="207" stroke="#e7cf9a" strokeWidth="3.4" strokeLinecap="round" /><line x1="40" y1="207" x2="130" y2="207" stroke="#1b0f08" strokeWidth="4" strokeLinecap="round" /><line x1="328" y1="207" x2="332" y2="207" stroke="#3b7fd6" strokeWidth="3.4" /></g>}
      {cue === 'aim' && <g><line x1="40" y1="70" x2="160" y2="96" stroke="#e7cf9a" strokeWidth="3" strokeLinecap="round" /><line x1="40" y1="70" x2="80" y2="78.7" stroke="#1b0f08" strokeWidth="3.6" strokeLinecap="round" /></g>}
    </svg>
  );
}
