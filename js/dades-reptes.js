function _prng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function() {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function _calculaRuscDia() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const seedNum = parseInt(`${y}${m}${day}`, 10);
  
  const rng = _prng(seedNum);

  const poolTargets = [24, 27, 28, 30, 32, 35, 36, 40, 42, 45, 48, 50, 54, 56, 60, 63, 64, 72, 80, 84, 90, 100];
  const target = poolTargets[Math.floor(rng() * poolTargets.length)];

  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let i = digits.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [digits[i], digits[j]] = [digits[j], digits[i]];
  }

  const iniciEpoca = new Date(2024, 0, 1).getTime();
  const numDia = Math.max(1, Math.floor((d.getTime() - iniciEpoca) / 86400000) + 1);

  return {
    num: numDia,
    target: target,
    center: digits[0],
    outer: digits.slice(1, 7)
  };
}

const DAILY_GAME = _calculaRuscDia();
window.DAILY_GAME = DAILY_GAME;
