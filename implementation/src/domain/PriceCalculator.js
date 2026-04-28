/**
 * PriceCalculator
 * 割引率・割引額・ポイント還元率・実質お得度の計算・補完ロジック
 */

/**
 * 生データから表示用の計算結果を生成する
 * @param {{
 *   currentPrice: number|null,
 *   listPrice: number|null,
 *   pointAmount: number,
 *   pointRate: number,
 *   couponRate: number|null,
 *   couponAmount: number|null
 * }} raw
 * @returns {{
 *   currentPrice: number|null,
 *   listPrice: number|null,
 *   discountAmount: number|undefined,
 *   discountRate: number|undefined,
 *   pointAmount: number,
 *   pointRate: number,
 *   couponRate: number|null,
 *   couponAmount: number|null,
 *   effectivePrice: number|null,
 *   effectiveDiscountRate: number|null
 * }}
 */
export function calculate(raw) {
  const { currentPrice, listPrice, pointAmount, pointRate: rawPointRate, couponRate, couponAmount, isKindleUnlimited } = raw;

  let discountAmount;
  let discountRate;

  if (currentPrice !== null && listPrice !== null && listPrice > currentPrice) {
    discountAmount = listPrice - currentPrice;
    discountRate = Math.round((discountAmount / listPrice) * 1000) / 10; // 小数点第1位
  }

  // ポイント還元率の補完: 額があるのに率がゼロの場合は計算する
  let pointRate = rawPointRate;
  if (pointAmount > 0 && pointRate === 0 && currentPrice !== null && currentPrice > 0) {
    pointRate = Math.round((pointAmount / currentPrice) * 1000) / 10; // 小数点第1位
  }

  // 実質価格・実質割引率の計算（クーポン＋ポイント込み）
  let effectivePrice = null;
  let effectiveDiscountRate = null;

  if (currentPrice !== null && (pointAmount > 0 || couponRate !== null || couponAmount !== null || discountAmount !== undefined)) {
    // クーポン適用後価格
    let afterCoupon = currentPrice;
    if (couponRate !== null) {
      afterCoupon = Math.round(currentPrice * (1 - couponRate / 100));
    } else if (couponAmount !== null) {
      afterCoupon = currentPrice - couponAmount;
    }

    // ポイント分を差し引いた実質負担額
    effectivePrice = Math.max(0, Math.round(afterCoupon - pointAmount));

    // 実質割引率: 定価があれば定価比、なければ現在価格比で計算
    const basePrice = (listPrice !== null && listPrice > 0) ? listPrice : currentPrice;
    if (basePrice > 0) {
      effectiveDiscountRate = Math.round((1 - effectivePrice / basePrice) * 1000) / 10;
    }
  }

  // 実質割引の内訳パーツ（表示用: 割引X% + クーポンY% + ptZ%）
  const effectiveBreakdownParts = [];
  if (discountRate !== undefined) effectiveBreakdownParts.push(`割引${discountRate}%`);
  if (couponRate !== null) effectiveBreakdownParts.push(`クーポン${couponRate}%`);
  else if (couponAmount !== null) effectiveBreakdownParts.push(`クーポン¥${couponAmount.toLocaleString()}`);
  if (pointRate > 0) effectiveBreakdownParts.push(`pt${pointRate}%`);
  else if (pointAmount > 0) effectiveBreakdownParts.push(`pt${pointAmount}円`);

  return {
    currentPrice,
    listPrice,
    discountAmount,
    discountRate,
    pointAmount,
    pointRate,
    couponRate: couponRate ?? null,
    couponAmount: couponAmount ?? null,
    effectivePrice,
    effectiveDiscountRate,
    effectiveBreakdownParts,
    isKindleUnlimited: isKindleUnlimited ?? false
  };
}
