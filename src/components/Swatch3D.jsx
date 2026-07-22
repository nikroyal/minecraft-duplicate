import React from 'react';
import { BLOCKS, ITEMS, thingColor, tileFor } from '../config.js';
import { getTileDataURL, getItemDataURL } from '../world.js';

export default function Swatch3D({ id }) {
  if (!id || id <= 0) return null;

  // Render 2D pixel-art icon for items (e.g. tools, ingots, diamond, apple, coal, bread)
  if (ITEMS[id] && !BLOCKS[id]) {
    const itemUrl = getItemDataURL(id);
    return (
      <div className="item-swatch-2d" style={{ width: 24, height: 24, display: 'grid', placeItems: 'center' }}>
        <img src={itemUrl} alt="" style={{ width: 20, height: 20, imageRendering: 'pixelated' }} />
      </div>
    );
  }

  // Render 3D isometric block with exact texture faces for top (face 0), left (face 5), and right (face 2)
  const topTile = tileFor(id, 0);
  const leftTile = tileFor(id, 5);
  const rightTile = tileFor(id, 2);

  const topUrl = getTileDataURL(topTile);
  const leftUrl = getTileDataURL(leftTile);
  const rightUrl = getTileDataURL(rightTile);

  const fallbackCol = thingColor(id);

  return (
    <div className="swatch-3d">
      <div 
        className="face top" 
        style={{ 
          backgroundImage: topUrl ? `url("${topUrl}")` : undefined, 
          backgroundColor: shadeStr(fallbackCol, 1.18),
          backgroundSize: 'cover',
          imageRendering: 'pixelated',
          filter: 'brightness(1.15)'
        }} 
      />
      <div 
        className="face left" 
        style={{ 
          backgroundImage: leftUrl ? `url("${leftUrl}")` : undefined, 
          backgroundColor: shadeStr(fallbackCol, 0.88),
          backgroundSize: 'cover',
          imageRendering: 'pixelated',
          filter: 'brightness(0.85)'
        }} 
      />
      <div 
        className="face right" 
        style={{ 
          backgroundImage: rightUrl ? `url("${rightUrl}")` : undefined, 
          backgroundColor: shadeStr(fallbackCol, 0.68),
          backgroundSize: 'cover',
          imageRendering: 'pixelated',
          filter: 'brightness(0.68)'
        }} 
      />
    </div>
  );
}

function shadeStr(hexInput, factor) {
  let hex = 0x888888;
  if (typeof hexInput === 'number' && !isNaN(hexInput)) {
    hex = hexInput;
  } else if (typeof hexInput === 'string') {
    const parsed = parseInt(hexInput.replace('#', ''), 16);
    if (!isNaN(parsed)) hex = parsed;
  }
  const r = Math.min(255, Math.max(0, Math.floor(((hex >> 16) & 255) * factor)));
  const g = Math.min(255, Math.max(0, Math.floor(((hex >> 8) & 255) * factor)));
  const b = Math.min(255, Math.max(0, Math.floor((hex & 255) * factor)));
  return `rgb(${r},${g},${b})`;
}

