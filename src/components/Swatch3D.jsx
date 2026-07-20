import React from 'react';
import { thingColor } from '../config.js';

export default function Swatch3D({ id }) {
  const baseCol = thingColor(id);
  const r = (baseCol >> 16) & 255;
  const g = (baseCol >> 8) & 255;
  const b = baseCol & 255;

  const getShade = (factor) => {
    const rs = Math.max(0, Math.min(255, Math.floor(r * factor)));
    const gs = Math.max(0, Math.min(255, Math.floor(g * factor)));
    const bs = Math.max(0, Math.min(255, Math.floor(b * factor)));
    return `rgb(${rs},${gs},${bs})`;
  };

  return (
    <div className="swatch-3d">
      <div className="face top" style={{ backgroundColor: getShade(1.18) }} />
      <div className="face left" style={{ backgroundColor: getShade(0.88) }} />
      <div className="face right" style={{ backgroundColor: getShade(0.68) }} />
    </div>
  );
}
