import { useEffect, useRef, useState } from 'react';
import type { ChartConfiguration, Point } from 'chart.js';
import { Chart } from './registry';
import { useChartReducedMotion } from './reduced-motion';
import { RowDetail } from './controls';
import type { ViewRow } from './rows';

type Kind = 'scatter' | 'bar';
export default function CohortChart({ rows, view, name, selected = '', onSelect, parameterRange }: {
  rows: ViewRow[]; view: 'paired' | 'grouped' | 'scatter' | 'heatmap'; name: string;
  selected?: string; onSelect?: (id: string) => void; parameterRange?: [number, number];
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const instance = useRef<Chart<Kind, (number | Point | null)[], string> | null>(null);
  const reduce = useChartReducedMotion();
  const [hover, setHover] = useState('');
  const detail = rows.find(r => r.id === (hover || selected));
  const categories = [...new Set(rows.map(r => r.modelKey))];
  const series = [...new Set(rows.map(r => r.domain!))];
  useEffect(() => () => { instance.current?.stop(); instance.current?.destroy(); instance.current = null; }, [view]);
  useEffect(() => {
    if (!canvas.current) return;
    const colors = ['#6ce5ef', '#aa98ff'];
    const ticks = { color: '#c0cadc', font: { family: '"DM Sans", sans-serif', size: 11 }, autoSkip: false };
    const grid = { color: '#263044' };
    const labels = categories.map(key => rows.find(r => r.modelKey === key)!.label);
    const axisLabel = (index: number) => {
      const label = labels[index] ?? '';
      const limit = canvas.current!.clientWidth < 550 ? 22 : 70;
      return label.length > limit ? label.slice(0, limit - 1) + '…' : label;
    };
    const mapped: ViewRow[][] = [];
    const config: ChartConfiguration<Kind, (number | Point | null)[], string> = {
      type: view === 'grouped' ? 'bar' : 'scatter', data: { labels, datasets: [] },
      options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', color: '#c0cadc',
        animation: reduce ? false : { duration: 380, easing: 'easeOutQuart' }, animations: { base: { duration: 0 } },
        events: ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove'],
        onHover(e, elements) { setHover(e.type === 'mouseout' || !elements.length ? '' : mapped[elements[0].datasetIndex]?.[elements[0].index]?.id ?? ''); },
        onClick(_e, elements) { if (elements.length) onSelect?.(mapped[elements[0].datasetIndex]?.[elements[0].index]?.id ?? ''); },
        scales: {
          x: { type: parameterRange ? 'logarithmic' : 'linear', min: parameterRange?.[0] ?? 0,
            max: parameterRange?.[1] ?? (rows[0]?.unit === 'observed compatible results' ? Math.max(1, ...rows.map(r => r.value ?? 0)) : 1), grid,
            ticks: { ...ticks, autoSkip: true, callback: v => parameterRange ? `${Number(v) / 1e9}B` : rows[0]?.unit === 'observed compatible results' ? String(v) : `${Number(v) * 100}%` },
            title: { display: true, text: parameterRange ? 'Parameters · logarithmic scale' : rows[0]?.unit ?? 'Normalized source fraction', color: '#c0cadc' } },
          y: view === 'grouped' ? { type: 'category', ticks: { ...ticks, callback: v => axisLabel(Number(v)) }, grid: { display: false } } : {
            type: 'linear', min: -.5, max: Math.max(.5, categories.length - .5), reverse: true, grid: { display: false },
            afterBuildTicks: axis => { axis.ticks = categories.map((_, value) => ({ value })); }, ticks: { ...ticks, callback: v => axisLabel(Number(v)) } },
        },
      },
    };
    if (view === 'heatmap') {
      mapped.push(rows);
      config.options!.scales!.x = { type: 'linear', min: -.5, max: series.length - .5, grid: { display: false },
        afterBuildTicks: axis => { axis.ticks = series.map((_, value) => ({ value })); }, ticks: { ...ticks, callback: v => series[Number(v)] ?? '' } };
      config.data.datasets = [{ data: rows.map(r => ({ x: series.indexOf(r.domain!), y: categories.indexOf(r.modelKey) })), pointRadius: 0, pointHitRadius: 25 }];
      config.plugins = [{ id: 'axion-parameter-cells', afterDatasetsDraw(chart) {
        const width = chart.chartArea.width / series.length, height = chart.chartArea.height / categories.length;
        const [low, high] = parameterRange!;
        chart.getDatasetMeta(0).data.forEach((point, index) => {
          const row = rows[index], { x, y } = point.getProps(['x', 'y'], false), ctx = chart.ctx;
          const left = x - width / 2 + 3, top = y - height / 2 + 3;
          const intensity = row.value === null ? 0 : Math.max(0, Math.min(1, Math.log(row.value / low) / Math.log(high / low)));
          ctx.save(); ctx.beginPath(); ctx.roundRect(left, top, width - 6, height - 6, 6);
          ctx.fillStyle = row.value === null ? '#111723' : `rgba(108,229,239,${.12 + .66 * intensity})`; ctx.fill();
          ctx.strokeStyle = '#566078'; ctx.stroke();
          if (row.value === null) {
            ctx.save(); ctx.clip(); ctx.strokeStyle = '#2d374d';
            for (let offset = -height; offset < width; offset += 12) { ctx.beginPath(); ctx.moveTo(left + offset, top + height); ctx.lineTo(left + offset + height, top); ctx.stroke(); }
            ctx.restore();
          }
          ctx.fillStyle = '#f5f7fc'; ctx.font = '500 12px "IBM Plex Mono",monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(row.value === null ? '—' : row.valueLabel, x, y); ctx.restore();
        });
      } }];
    } else {
      config.data.datasets = series.map((key, index) => {
        const dataRows = categories.map(category => rows.find(r => r.modelKey === category && r.domain === key)!);
        const plotted = view === 'grouped' ? dataRows : dataRows.filter(r => r.value !== null);
        mapped.push(plotted);
        return { label: key, data: view === 'grouped' ? plotted.map(r => r.value) : plotted.map(r => ({ x: r.value!, y: categories.indexOf(r.modelKey) })),
          backgroundColor: colors[index % colors.length], borderColor: colors[index % colors.length],
          pointStyle: index === 0 ? 'circle' : 'rect', pointRadius: 5, pointHoverRadius: 7, borderRadius: 4, maxBarThickness: 14 };
      });
      if (view === 'paired' || view === 'scatter') config.plugins = [{ id: 'axion-paired-links', beforeDatasetsDraw(chart) {
        const positions = new Map<string, { x: number; y: number }[]>();
        mapped.forEach((dataRows, dataset) => chart.getDatasetMeta(dataset).data.forEach((point, index) => {
          const key = dataRows[index].modelKey, coords = point.getProps(['x', 'y'], false);
          positions.set(key, [...(positions.get(key) ?? []), { x: coords.x, y: coords.y }]);
        }));
        chart.ctx.save(); chart.ctx.strokeStyle = '#566078'; chart.ctx.lineWidth = 2;
        positions.forEach(points => { if (points.length !== 2) return; chart.ctx.beginPath(); chart.ctx.moveTo(points[0].x, points[0].y); chart.ctx.lineTo(points[1].x, points[1].y); chart.ctx.stroke(); });
        chart.ctx.restore();
      } }];
    }
    config.plugins ??= [];
    if (!instance.current) instance.current = new Chart(canvas.current, config);
    else {
      const chart = instance.current;
      config.data.datasets = config.data.datasets.map((dataset, index) => Object.assign(chart.data.datasets[index] ?? {}, dataset));
      chart.data = config.data; chart.options = config.options!;
      chart.config.plugins!.splice(0, chart.config.plugins!.length, ...(config.plugins ?? []));
      if (reduce) chart.stop(); chart.update(reduce ? 'none' : undefined);
    }
    canvas.current.dataset.rowIds = JSON.stringify(mapped.map(dataRows => dataRows.map(r => r.id)));
    setHover('');
  }, [rows, view, reduce, onSelect, parameterRange]);
  return <div className="core-chart cohort-chart" data-testid={`${name}-chart`} data-view={view} data-reduced-motion={String(reduce)}>
    <div className="core-canvas-wrap" tabIndex={0} aria-label={`Scrollable ${name} chart`}><div className="core-canvas-size" style={{ height: Math.max(260, categories.length * (view === 'grouped' ? 58 : 42) + 90) }}>
      <canvas ref={canvas} role="img" aria-label={`${name} ${view}; exact values and sources follow below`}/>
    </div></div>
    <p className="core-scale-note">{view === 'heatmap' ? `Columns: ${series.join(' · ')}` : series.map((key, index) => `${index === 0 ? 'Cyan circle / first bar' : 'Violet square / second bar'}: ${key}`).join(' · ')}.
      {parameterRange && ` Shared logarithmic range ${parameterRange[0] / 1e9}B–${parameterRange[1] / 1e9}B; total sets the bucket. Activated counts are separate.`}
      {view === 'heatmap' && ' Intensity uses that same log range. Hatched — cells are unknown, never zero.'}</p>
    <div className="core-tooltip" data-testid={`${name}-tooltip`} role="status" aria-live="polite">{detail ? <RowDetail row={detail}/> : 'Point to a mark or focus a value below for its exact value, qualification and sources.'}</div>
  </div>;
}
