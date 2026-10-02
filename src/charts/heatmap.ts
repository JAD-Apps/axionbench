import type { Plugin } from 'chart.js';
import type { ViewRow } from './rows';

// Original matrix drawing over a registered ScatterController. Points provide
// Chart.js coordinates and hit testing; this plugin paints the cells and labels.
// The metric is row.value, NEVER point.y (which is only a model position).
export function heatmapPlugin(rows: () => ViewRow[], columns: number, models: number): Plugin<'bar' | 'scatter' | 'radar'> {
  return { id: 'axion-domain-cells', afterDatasetsDraw(chart) {
    const ctx = chart.ctx;
    const width = chart.chartArea.width / columns;
    const height = chart.chartArea.height / models;
    chart.getDatasetMeta(0).data.forEach((point, index) => {
      const row = rows()[index]; if (!row) return;
      const { x, y } = point.getProps(['x', 'y'], false);
      const left = x - width / 2 + 3, top = y - height / 2 + 3;
      ctx.save();
      ctx.beginPath(); ctx.roundRect(left, top, width - 6, height - 6, 8);
      ctx.fillStyle = row.value === null ? '#111723' : `rgba(108,229,239,${.12 + .66 * row.value})`;
      ctx.fill(); ctx.strokeStyle = row.value === null ? '#566078' : '#6ce5ef'; ctx.lineWidth = .7; ctx.stroke();
      if (row.value === null) {
        ctx.clip(); ctx.strokeStyle = '#2d374d';
        for (let offset = -height; offset < width; offset += 12) {
          ctx.beginPath(); ctx.moveTo(left + offset, top + height); ctx.lineTo(left + offset + height, top); ctx.stroke();
        }
      }
      ctx.fillStyle = '#f5f7fc'; ctx.font = '500 12px "IBM Plex Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(row.value === null ? '—' : `${(row.value * 100).toFixed(1)}%`, x, y);
      ctx.restore();
    });
  } };
}
