// po kazdym sprawdzeniu ceny: ktore alerty odpalic.
// cztery przelaczniki, ktore uzytkownik ustawia przy trasie

const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
const stdev = (arr) => {
  const m = mean(arr);
  return Math.sqrt(mean(arr.map((v) => (v - m) ** 2)));
};

export function evaluateAlertRules({ route, currentQuote, previousPrice, historyPrices, forecast }) {
  const alerts = [];
  if (!currentQuote) return alerts;

  const price = Number(currentQuote.price);
  const cur = currentQuote.currency;
  const label = `${route.origin_code} → ${route.destination_code}`;

  if (route.alert_price_drop && previousPrice != null && price < previousPrice) {
    const diff = Math.round((previousPrice - price) * 100) / 100;
    alerts.push({ type: 'price_drop', title: 'Cena spadła', detail: `${label}: ${price} ${cur} (o ${diff} mniej niż poprzednio)`, price });
  }

  if (route.alert_target && route.max_price != null && price <= Number(route.max_price)) {
    alerts.push({ type: 'target_reached', title: 'Cena docelowa osiągnięta', detail: `${label}: ${price} ${cur}, twój limit to ${route.max_price}`, price });
  }

  // nietypowo tanio = poltora odchylenia ponizej sredniej
  if (route.alert_unusual && historyPrices?.length >= 5) {
    const avg = mean(historyPrices);
    if (price <= avg - 1.5 * stdev(historyPrices)) {
      alerts.push({ type: 'unusual_low', title: 'Nietypowo niska cena', detail: `${label}: ${price} ${cur}, średnio jest ${Math.round(avg)}`, price });
    }
  }

  if (route.alert_forecast_rise && forecast?.status === 'ok' && forecast.trend === 'rising') {
    alerts.push({ type: 'forecast_rise', title: 'Ceny pewnie pójdą w górę', detail: `${label}: prognoza pokazuje wzrost w najbliższych dniach`, price });
  }

  return alerts;
}
