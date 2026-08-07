// ---- Green Coin Economy & Villager Trade Resolution ---------------------
import { addItem, removeItem, invCount } from '../player.js';
import { toast } from '../ui.js';
import { thingName } from '../config.js';
import { GREEN_COIN_ITEM_ID, getTradeById } from './villagerTradeCatalog.js';

export function executeBuyTrade(trade) {
  if (!trade) return false;
  const cost = trade.priceInCoins || 1;
  const yieldCount = trade.yieldCount || 1;

  const currentCoins = invCount(GREEN_COIN_ITEM_ID);
  if (currentCoins < cost) {
    toast(`❌ Not enough Green Coins! Required: 🪙 ${cost}, You have: 🪙 ${currentCoins}`);
    return false;
  }

  // Deduct coins & give item
  removeItem(GREEN_COIN_ITEM_ID, cost);
  addItem(trade.itemId, yieldCount);
  toast(`🛍️ Purchased +${yieldCount} ${thingName(trade.itemId)} for 🪙 ${cost} Green Coins!`);
  return true;
}

export function executeSellTrade(trade) {
  if (!trade) return false;
  const reqQty = trade.requiredQty || 1;
  const rewardCoins = trade.rewardCoins || 1;

  const hasQty = invCount(trade.itemId);
  if (hasQty < reqQty) {
    toast(`❌ Not enough ${thingName(trade.itemId)} to sell! Required: ${reqQty}, You have: ${hasQty}`);
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
