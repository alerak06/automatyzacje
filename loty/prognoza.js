// prosta prognoza ceny lotu bez zadnego ML: mediana z ostatnich sprawdzen,
// trend liniowy, zmiennosc, ile dni do wylotu, sezon i dzien tygodnia.
// kazda liczbe da sie wytlumaczyc uzytkownikowi i o to chodzilo

const MIN_SNAPSHOTS = 3;

// sezonowosc wg miesiaca wylotu, > 1 drozej niz srednio, < 1 taniej. bardzo z grubsza
const SEASON = { 1: 0.92, 2: 0.93, 3: 0.97, 4: 1.02, 5: 1.05, 6: 1.12, 7: 1.22, 8: 1.2, 9: 1.0, 10: 0.95, 11: 0.9, 12: 1.1 };

const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
const stdev = (arr) => {
  const m = mean(arr);
  return Math.sqrt(mean(arr.map((v) => (v - m) ** 2)));
};

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// nachylenie prostej (regresja liniowa) jako % sredniej ceny na caly okres
function trendPct(prices) {
  const n = prices.length;
  const xs = prices.map((_, i) => i);
  const xMean = mean(xs);
  const yMean = mean(prices);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (prices[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  return yMean === 0 ? 0 : (slope * (n - 1)) / yMean;
}

// swieta i wakacje
function inHolidayWindow(date) {
  const md = String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  const windows = [{ from: '12-18', to: '01-06' }, { from: '06-25', to: '08-25' }];
  return windows.some((w) => (w.from <= w.to ? md >= w.from && md <= w.to : md >= w.from || md <= w.to));
}

// snapshots: [{ price, checked_at }] od najstarszego
export function computeForecast(snapshots, route, now = new Date()) {
  if (!snapshots || snapshots.length < MIN_SNAPSHOTS) {
    return { status: 'insufficient_data' };
  }

  const prices = snapshots.map((s) => Number(s.price));
  const recent = prices.slice(-14);
  const latest = prices[prices.length - 1];

  const movingMedian = median(prices.slice(-7));
  const slope = trendPct(recent);
  const vol = mean(recent) > 0 ? stdev(recent) / mean(recent) : 0;

  const depart = new Date(route.depart_date);
  const daysToDeparture = Math.max(0, Math.round((depart - now) / 86400000));
  const season = SEASON[depart.getMonth() + 1] || 1;
  const holiday = inHolidayWindow(depart) ? 1.08 : 1;
  const day = depart.getDay();
  const weekday = day === 0 || day === 5 || day === 6 ? 1.04 : 0.98; // weekend drozej

  const seasonal = season * holiday * weekday - 1;
  const mid = Math.round(latest * (1 + slope * 0.5 + seasonal * 0.4) * 100) / 100;
  const spread = Math.max(0.05, Math.min(0.35, vol + Math.abs(seasonal) * 0.5));
  const low = Math.round(mid * (1 - spread) * 100) / 100;
  const high = Math.round(mid * (1 + spread + Math.max(0, seasonal)) * 100) / 100;

  // pewnosc: im mniejsze wahania i wiecej danych, tym wyzsza
  const dataQuality = Math.min(1, snapshots.length / 21);
  const confidence = Math.round(Math.max(0.3, Math.min(0.95, (1 - vol) * 0.6 + dataQuality * 0.4)) * 100) / 100;

  const trend = slope > 0.03 ? 'rising' : slope < -0.03 ? 'falling' : 'stable';

  let recommendation = 'monitor';
  if (daysToDeparture <= 7) recommendation = 'buy_now';
  else if (trend === 'rising' && confidence >= 0.45) recommendation = 'buy_now';
  else if (trend === 'falling' && daysToDeparture > 21) recommendation = 'wait';

  return {
    status: 'ok',
    range: { low, mid, high },
    confidence,
    trend,
    recommendation,
    daysToDeparture,
    medianLast7: Math.round(movingMedian),
  };
}
