// Quick test to verify price calculation
const sqrtPriceX96 = 112045541949572279837463n; // From your pool data

console.log('=== PRICE CALCULATION TEST ===');
console.log('sqrtPriceX96:', sqrtPriceX96.toString());

// Calculate price correctly using JavaScript numbers for precision
const Q96 = 2 ** 96; // 2^96 as JavaScript number
const sqrtPriceNum = Number(sqrtPriceX96);
const sqrtPrice = sqrtPriceNum / Q96;
const price = sqrtPrice * sqrtPrice;

console.log('Q96:', Q96);
console.log('sqrtPriceX96 (as number):', sqrtPriceNum);
console.log('sqrtPrice:', sqrtPrice);
console.log('price (token1/token0):', price);

// Since token0=WETH, token1=AAVE, price = AAVE/WETH
// We want AAVE per WETH, so aavePerWeth = price
const aavePerWeth = price;
const wethPerAave = 1 / price;

console.log('AAVE per WETH:', aavePerWeth);
console.log('WETH per AAVE:', wethPerAave);

console.log('=== EXPECTED FROM POOL BALANCES ===');
console.log('Pool has 21.61 AAVE and 9.99 WETH');
console.log('Expected AAVE per WETH:', 21.61 / 9.99);
console.log('Expected WETH per AAVE:', 9.99 / 21.61);

console.log('=== COMPARISON ===');
console.log('Calculated AAVE per WETH:', aavePerWeth.toFixed(6));
console.log('Expected AAVE per WETH:', (21.61 / 9.99).toFixed(6));
console.log('Match:', Math.abs(aavePerWeth - (21.61 / 9.99)) < 0.01 ? 'YES' : 'NO');
