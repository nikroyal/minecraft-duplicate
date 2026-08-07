// ---- Villager Trade Catalogue & Green Coin Economy Registry ------------
import { BLOCKS, ITEMS, thingName } from '../config.js';

export const GREEN_COIN_ITEM_ID = 152; // Emerald Item ID represents 🪙 Green Coin
export const SHOWCASE_PEDESTAL_BLOCK_ID = 95; // Display Pedestal block ID

export const TRADE_CATALOGUE = [
  // ── FARMER TRADES ──
  {
    tradeId: "farm_wheat_sell",
    type: "buy_from_player",
    profession: "farmer",
    itemId: 136, // Wheat
    requiredQty: 18,
    rewardCoins: 1,
    name: "Sell 18 Wheat → 🪙 1 Green Coin",
    minLevel: 1,
    stockMax: 16
  },
  {
    tradeId: "farm_bread_buy",
    type: "sell_to_player",
    profession: "farmer",
    itemId: 135, // Bread
    yieldCount: 4,
    priceInCoins: 1,
    name: "4 Fresh Bread",
    minLevel: 1,
    stockMax: 12
  },
  {
    tradeId: "farm_apple_buy",
    type: "sell_to_player",
    profession: "farmer",
    itemId: 130, // Apple
    yieldCount: 3,
    priceInCoins: 2,
    name: "3 Sweet Apples",
    minLevel: 2,
    stockMax: 8
  },
  {
    tradeId: "farm_golden_apple",
    type: "sell_to_player",
    profession: "farmer",
    itemId: 137, // Golden Apple
    yieldCount: 1,
    priceInCoins: 8,
    name: "Enchanted Golden Apple",
    minLevel: 3,
    stockMax: 2
  },

  // ── BLACKSMITH & ARMORER TRADES ──
  {
    tradeId: "smith_coal_sell",
    type: "buy_from_player",
    profession: "blacksmith",
    itemId: 101, // Coal
    requiredQty: 12,
    rewardCoins: 1,
    name: "Sell 12 Coal → 🪙 1 Green Coin",
    minLevel: 1,
    stockMax: 16
  },
  {
    tradeId: "smith_iron_ingot_sell",
    type: "buy_from_player",
    profession: "blacksmith",
    itemId: 102, // Iron Ingot
    requiredQty: 4,
    rewardCoins: 1,
    name: "Sell 4 Iron Ingots → 🪙 1 Green Coin",
    minLevel: 1,
    stockMax: 12
  },
  {
    tradeId: "smith_iron_pickaxe",
    type: "sell_to_player",
    profession: "blacksmith",
    itemId: 107, // Iron Pickaxe
    yieldCount: 1,
    priceInCoins: 3,
    name: "Iron Pickaxe",
    minLevel: 1,
    stockMax: 4
  },
  {
    tradeId: "smith_iron_chestplate",
    type: "sell_to_player",
    profession: "blacksmith",
    itemId: 165, // Iron Chestplate
    yieldCount: 1,
    priceInCoins: 6,
    name: "Forged Iron Chestplate",
    minLevel: 2,
    stockMax: 3
  },
  {
    tradeId: "smith_diamond_pickaxe",
    type: "sell_to_player",
    profession: "blacksmith",
    itemId: 108, // Diamond Pickaxe
    yieldCount: 1,
    priceInCoins: 12,
    name: "Reinforced Diamond Pickaxe",
    minLevel: 3,
    stockMax: 2
  },

  // ── LIBRARIAN TRADES ──
  {
    tradeId: "lib_paper_sell",
    type: "buy_from_player",
    profession: "librarian",
    itemId: 116, // Paper
    requiredQty: 24,
    rewardCoins: 1,
    name: "Sell 24 Paper → 🪙 1 Green Coin",
    minLevel: 1,
    stockMax: 16
  },
  {
    tradeId: "lib_book_buy",
    type: "sell_to_player",
    profession: "librarian",
    itemId: 117, // Book
    yieldCount: 2,
    priceInCoins: 1,
    name: "2 Ancient Books",
    minLevel: 1,
    stockMax: 10
  },

  // ── CLERIC TRADES ──
  {
    tradeId: "cleric_redstone_buy",
    type: "sell_to_player",
    profession: "cleric",
    itemId: 151, // Redstone Dust
    yieldCount: 4,
    priceInCoins: 1,
    name: "4 Redstone Dust",
    minLevel: 1,
    stockMax: 12
  },
  {
    tradeId: "cleric_glowstone_buy",
    type: "sell_to_player",
    profession: "cleric",
    itemId: 21, // Glowstone Block
    yieldCount: 2,
    priceInCoins: 3,
    name: "2 Glowstone Blocks",
    minLevel: 2,
    stockMax: 6
  }
];

export function getTradesByProfession(profession) {
  return TRADE_CATALOGUE.filter(t => t.profession === profession);
}

export function getTradeById(tradeId) {
  return TRADE_CATALOGUE.find(t => t.tradeId === tradeId);
}

export function getTradeDisplayName(trade) {
  if (!trade) return "Unknown Trade";
  if (trade.name) return trade.name;
  return thingName(trade.itemId);
}
