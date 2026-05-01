// Chart.js 추세 그래프

let chartInstance = null;

const CONTEXT_COLORS = {
  fasting: '#0ea5e9',
  before_meal: '#0284c7',
  after_meal: '#f97316',
  bedtime: '#8b5cf6',
  random: '#64748b',
};

export function renderTrend(canvas, readings) {
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
  const sorted = [...readings].sort((a, b) => a.timestamp - b.timestamp);

  const data = sorted.map((r) => ({ x: r.timestamp, y: r.value, ctx: r.context }));
  const colors = sorted.map((r) => CONTEXT_COLORS[r.context] || '#64748b');

  chartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      datasets: [{
        label: '혈당 (mg/dL)',
        data,
        borderColor: '#0ea5e9',
        backgroundColor: 'rgba(14,165,233,0.1)',
        pointBackgroundColor: colors,
        pointBorderColor: colors,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.25,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => new Date(items[0].parsed.x).toLocaleString('ko-KR'),
            label: (item) => `${item.parsed.y} mg/dL`,
          },
        },
      },
      scales: {
        x: {
          type: 'time',
          time: { unit: 'day', displayFormats: { day: 'MM/dd' } },
          ticks: { maxTicksLimit: 6, color: '#94a3b8' },
          grid: { color: '#f1f5f9' },
        },
        y: {
          beginAtZero: false,
          suggestedMin: 60,
          suggestedMax: 200,
          ticks: { color: '#94a3b8' },
          grid: { color: '#f1f5f9' },
        },
      },
    },
  });
}

export function summarize(readings) {
  if (!readings.length) return null;
  const values = readings.map((r) => r.value);
  const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // 정상 범위: 70-180 mg/dL (식후 포함 일반 가이드)
  const inRange = readings.filter((r) => r.value >= 70 && r.value <= 180).length;
  const tir = Math.round((inRange / readings.length) * 100);

  // 컨텍스트별 평균
  const byContext = {};
  for (const r of readings) {
    const c = r.context || 'random';
    byContext[c] = byContext[c] || [];
    byContext[c].push(r.value);
  }
  const ctxAvg = {};
  for (const k of Object.keys(byContext)) {
    const arr = byContext[k];
    ctxAvg[k] = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  }

  return { avg, min, max, tir, count: readings.length, ctxAvg };
}
