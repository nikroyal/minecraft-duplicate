// ---- Green Coin Economy & Villager Trade Resolution ---------------------
import { addItem, removeItem, invCount, hasInventorySpace } from '../player.js';
import { toast } from '../ui.js';
import { thingName } from '../config.js';
import { GREEN_COIN_ITEM_ID, getTradeById } from './villagerTradeCatalog.js';

export function executeBuyTrade(trade) {
  if (!trade) return false;
  const cost = Math.max(1, Math.floor(trade.priceInCoins || 1));
  const yieldCount = Math.max(1, Math.floor(trade.yieldCount || 1));

  // 1. Check full inventory capacity
  if (!hasInventorySpace(trade.itemId, yieldCount)) {
    toast(`❌ Inventory full for ${thingName(trade.itemId)}! Free up inventory space.`);
    return false;
  }

  // 2. Check wallet balance
  const currentCoins = invCount(GREEN_COIN_ITEM_ID);
  if (currentCoins < cost) {
    toast(`❌ Not enough Green Coins! Required: 🪙 ${cost}, You have: 🪙 ${currentCoins}`);
    return false;
  }

  // Deduct coins & give item safely
  removeItem(GREEN_COIN_ITEM_ID, cost);
  addItem(trade.itemId, yieldCount);
  toast(`🛍️ Purchased +${yieldCount} ${thingName(trade.itemId)} for 🪙 ${cost} Green Coins!`);
  return true;
}

export function executeSellTrade(trade) {
  if (!trade) return false;
  const reqQty = Math.max(1, Math.floor(trade.requiredQty || 1));
  const rewardCoins = Math.max(1, Math.floor(trade.rewardCoins || 1));

  // Check item quantity
  const hasQty = invCount(trade.itemId);
  if (hasQty < reqQty) {
    toast(`❌ Not enough ${thingName(trade.itemId)} to sell! Required: ${reqQty}, You have: ${hasQty}`);
    return false;
  }

  // Check Green Coin capacity
  if (!hasInventorySpace(GREEN_COIN_ITEM_ID, rewardCoins)) {
    toast(`❌ Green Coin wallet capacity reached!`);
    return false;
  }

  // Deduct items & give Green Coins
  removeItem(trade.itemId, reqQty);
  addItem(GREEN_COIN_ITEM_ID, rewardCoins);
  toast(`🌾 Sold ${reqQty} ${thingName(trade.itemId)} for 🪙 ${rewardCoins} Green Coins!`);
  return true;
}

/**
 * Global window hook to trigger trade prompt UI
 */
export function openTradePrompt(tradeOrId) {
  const trade = typeof tradeOrId === 'string' ? getTradeById(tradeOrId) : tradeOrId;
  if (!trade) return;
  if (typeof window !== 'undefined' && window.__openTradePrompt) {
    window.__openTradePrompt(trade);
  }
}
