import { useEffect, useRef, useState } from 'react';
import { useChartReducedMotion } from './reduced-motion';
import { BarElement, PointElement, type ChartConfiguration, type ChartDataset, type Point } from 'chart.js';
import { Chart } from './registry';
import { heatmapPlugin } from './heatmap';
import { RowDetail } from './controls';
import type { ViewRow } from './rows';

type CoreType = 'bar' | 'scatter' | 'radar';
type Datum = number | null | Point;
type Config = ChartConfiguration<CoreType, Datum[], string>;
type Instance = Chart<CoreType, Datum[], string>;
export type CoreView = 'bars' | 'dots' | 'heatmap' | 'radar';
const colors = ['#6ce5ef', '#aa98ff'];
const font = { family: '"DM Sans", sans-serif', size: 12 };

export default function CoreChart({ rows, view, name, selected = '', onSelect, normalized = false, minimumRange = 1 }: {
  rows: ViewRow[]; view: CoreView; name: string; selected?: string; onSelect?: (id: string) => void; normalized?: boolean; minimumRange?: number;
}) {
  const reduce = useChartReducedMotion();
  const canvas = useRef<HTMLCanvasElement>(null);
  const instance = useRef<Instance | null>(null);
  const previousIds = useRef<string[]>([]);
  const radarDatasets = useRef(new Map<string, ChartDataset<CoreType, Datum[]>>());
  const currentRows = useRef(rows); currentRows.current = rows;
  const [hovered, setHovered] = useState('');
  const domains = [...new Set(rows.map(row => row.domain).filter((v): v is string => !!v))];
  const models = [...new Set(rows.map(row => row.modelKey))];
  const chosen = rows.find(row => row.id === (hovered || selected));
  const plotted = view === 'heatmap' || view === 'radar' ? rows : rows.filter(row => row.value !== null);

  useEffect(() => {
    if (!canvas.current) return;
    // One instance for this view. Changes to values/order update it in place.
    return () => { instance.current?.stop(); instance.current?.destroy(); instance.current = null; previousIds.current = []; radarDatasets.current.clear(); };
  }, [view]);

  useEffect(() => {
    if (!canvas.current) return;
    const plotRows = view === 'heatmap' || view === 'radar' ? rows : rows.filter(row => row.value !== null);
    const modelKeys = [...new Set(rows.map(row => row.modelKey))];
    const domainKeys = [...new Set(rows.map(row => row.domain).filter((v): v is string => !!v))];
    const type: CoreType = view === 'bars' ? 'bar' : view === 'radar' ? 'radar' : 'scatter';
    const config: Config = {
      type, data: { labels: view === 'radar' ? domainKeys.map(d => d.replaceAll('-', ' ')) : plotRows.map(row => row.label), datasets: [] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: reduce ? false : { duration: 380, easing: 'easeOutQuart' },
        // Label widths can move the plot's left edge between source panels.
        // Keep every bar anchored to the current zero axis during that change.
        animations: { base: { duration: 0 } },
        color: '#c0cadc', font, events: ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove'],
        onHover(event, elements) {
          if (event.type === 'mouseout' || !elements.length) { setHovered(''); return; }
          const e = elements[0];
          const row = view === 'radar' ? rows.find(r => r.modelKey === modelKeys[e.datasetIndex] && r.domain === domainKeys[e.index]) : plotRows[e.index];
          setHovered(row?.id ?? '');
        },
        onClick(_event, elements) {
          if (!elements.length) return;
          const e = elements[0];
          const row = view === 'radar' ? rows.find(r => r.modelKey === modelKeys[e.datasetIndex] && r.domain === domainKeys[e.index]) : plotRows[e.index];
          if (row) onSelect?.(row.id);
        },
        interaction: { mode: 'nearest', intersect: view !== 'heatmap' },
      },
    };
    const ticks = { color: '#c0cadc', font, padding: 8 };
    const grid = { color: '#263044', tickColor: '#263044' };
    const measured = plotRows.filter(row => row.value !== null);
    const min = normalized ? 0 : Math.min(0, ...measured.map(row => row.value!));
    const max = normalized ? 1 : Math.max(minimumRange, ...measured.map(row => row.value!)) * 1.08;
    if (view === 'radar') {
      config.options!.scales = { r: { min: 0, max: 1, grid, angleLines: { color: '#263044' },
        pointLabels: { color: '#c0cadc', font }, ticks: { ...ticks, stepSize: .25, backdropColor: '#080a0f', callback: v => `${Number(v) * 100}%` } } };
      config.data.datasets = modelKeys.map((key, i) => ({
        label: rows.find(row => row.modelKey === key)!.label, data: domainKeys.map(domain => rows.find(row => row.modelKey === key && row.domain === domain)?.value ?? null),
        borderColor: colors[i % colors.length], backgroundColor: colors[i % colors.length], pointRadius: 5, pointHoverRadius: 7,
        borderWidth: 2, fill: false, spanGaps: false,
      }));
    } else if (view === 'heatmap') {
      config.options!.scales = {
        x: { type: 'linear', min: -.5, max: domainKeys.length - .5, grid: { display: false },
          afterBuildTicks: axis => { axis.ticks = domainKeys.map((_, value) => ({ value })); },
          ticks: { ...ticks, stepSize: 1, autoSkip: false, maxRotation: 55, callback: v => domainKeys[Number(v)]?.replaceAll('-', ' ') ?? '' } },
        y: { type: 'linear', min: -.5, max: modelKeys.length - .5, reverse: true, grid: { display: false },
          afterBuildTicks: axis => { axis.ticks = modelKeys.map((_, value) => ({ value })); },
          ticks: { ...ticks, stepSize: 1, callback: v => rows.find(r => r.modelKey === modelKeys[Number(v)])?.label ?? '' } },
      };
      config.data.datasets = [{ data: plotRows.map(row => ({ x: domainKeys.indexOf(row.domain!), y: modelKeys.indexOf(row.modelKey) })), pointRadius: 0, pointHitRadius: 24 }];
      config.plugins = [heatmapPlugin(() => currentRows.current, domainKeys.length, modelKeys.length)];
    } else {
      config.options!.indexAxis = 'y';
      config.options!.scales = {
        x: { type: 'linear', min, max, grid, title: { display: true, text: normalized ? 'Normalized fraction · 0–100%' : [...new Set(rows.map(row => row.unit))].join(' / '), color: '#c0cadc', font },
          ticks: { ...ticks, callback: v => normalized ? `${(Number(v) * 100).toFixed(0)}%` : String(v) } },
        y: view === 'bars' ? { type: 'category', grid: { display: false }, ticks: { ...ticks, autoSkip: false } }
          : { type: 'linear', min: -.5, max: Math.max(.5, plotRows.length - .5), reverse: true, grid: { display: false },
            afterBuildTicks: axis => { axis.ticks = plotRows.map((_, value) => ({ value })); },
            ticks: { ...ticks, autoSkip: false, stepSize: 1, callback: v => plotRows[Number(v)]?.label ?? '' } },
      };
      const color = (row: ViewRow) => row.id === selected ? '#aa98ff' : '#6ce5ef';
      config.data.datasets = view === 'bars'
        ? [{ data: plotRows.map(row => row.value), backgroundColor: plotRows.map(color), borderRadius: 4, barThickness: 12 }]
        : [{ data: plotRows.map((row, i) => ({ x: row.value!, y: i })), backgroundColor: plotRows.map(color), pointRadius: 5, pointHoverRadius: 7 }];
      config.plugins = [{ id: 'axion-source-intervals', afterDatasetsDraw(chart) {
        const ctx = chart.ctx;
        chart.getDatasetMeta(0).data.forEach((element, index) => {
          const interval = plotRows[index]?.interval; if (!interval) return;
          const y = element.getProps(['y'], false).y;
          const low = chart.scales.x.getPixelForValue(interval.low), high = chart.scales.x.getPixelForValue(interval.high);
          ctx.save(); ctx.strokeStyle = '#f5f7fc'; ctx.lineWidth = 1.5; ctx.beginPath();
          ctx.moveTo(low, y); ctx.lineTo(high, y); ctx.moveTo(low, y - 4); ctx.lineTo(low, y + 4); ctx.moveTo(high, y - 4); ctx.lineTo(high, y + 4); ctx.stroke(); ctx.restore();
        });
      } }];
    }
    config.plugins ??= [];
    const chart = instance.current;
    if (!chart) instance.current = new Chart(canvas.current, config);
    else {
      if (view === 'radar') {
        // Reuse dataset objects by stable model identity, not the sorted index.
        config.data.datasets = config.data.datasets.map((d, i) => Object.assign(radarDatasets.current.get(modelKeys[i]) ?? {}, d) as ChartDataset<CoreType, Datum[]>);
      } else {
        // Carry existing animated elements with their observation identity.
        const elements = chart.getDatasetMeta(0).data;
        const old = new Map(previousIds.current.map((id, i) => [id, elements[i]]));
        const zero = chart.scales.x.getPixelForValue(0);
        chart.getDatasetMeta(0).data = plotRows.map((row, i) => old.get(row.id) ?? Object.assign(view === 'bars' ? new BarElement({}) : new PointElement({}),
          { x: zero, y: elements[Math.min(i, elements.length - 1)]?.y ?? chart.chartArea.top, base: zero, width: 0, height: 12,
            options: elements[Math.min(i, elements.length - 1)]?.options ?? { radius: view === 'heatmap' ? 0 : 5, hitRadius: 24 } }));
        // Chart.js associates its controller/meta with the dataset object.
        // Retain that object as well as its elements through a sorted update.
        config.data.datasets[0] = Object.assign(chart.data.datasets[0], config.data.datasets[0]);
      }
      chart.data = config.data; chart.options = config.options!;
      chart.config.plugins!.splice(0, chart.config.plugins!.length, ...(config.plugins ?? []));
      if (reduce) chart.stop(); chart.update(reduce ? 'none' : undefined);
    }
    previousIds.current = plotRows.map(row => row.id);
    if (view === 'radar') modelKeys.forEach((key, i) => radarDatasets.current.set(key, instance.current!.data.datasets[i]));
    canvas.current.dataset.animation = reduce ? 'off' : '380ms';
    canvas.current.dataset.rowIds = JSON.stringify(plotRows.map(row => row.id));
    canvas.current.dataset.values = JSON.stringify(plotRows.map(row => row.value));
  }, [rows, view, reduce, selected, onSelect, normalized, minimumRange]);

  useEffect(() => { setHovered(''); }, [view, rows]);
  return <div className="core-chart" data-testid={`${name}-chart`} data-view={view} data-reduced-motion={String(reduce)}>
    <div className={'core-canvas-wrap' + (view === 'heatmap' ? ' core-matrix-wrap' : '')} tabIndex={view === 'heatmap' ? 0 : undefined} aria-label={view === 'heatmap' ? 'Scrollable normalized domain heatmap' : undefined}>
      <div className="core-canvas-size" style={{ height: view === 'radar' ? 440 : view === 'heatmap' ? Math.max(280, models.length * 100) : Math.max(240, plotted.length * 32 + 80), minWidth: view === 'heatmap' ? domains.length * 80 + 160 : undefined }}>
        <canvas ref={canvas} role="img" aria-label={`${name} ${view}; exact values and sources follow in the accessible table`} />
      </div>
    </div>
    {view === 'radar' && <p className="core-scale-note">Every spoke uses the same normalized 0–1 scale (shown as 0–100%). Family means precede domain means. Missing and zero-weight spokes are gaps; lines break and no polygon is filled. {domains.filter(domain => rows.filter(row => row.domain === domain).every(row => row.value !== null)).length}/{domains.length} comparable spokes are shown. This is a partial domain comparison, not complete coverage.</p>}
    {view === 'heatmap' && <p className="core-scale-note">Cyan intensity uses a fixed 0–1 normalized scale. Hatched — cells have no selected comparable value; they are not zeroes.</p>}
    <div className="core-tooltip" data-testid={`${name}-tooltip`} role="status" aria-live="polite">
      {chosen ? <RowDetail row={chosen}/> : <span>Point to a mark or focus a value below to inspect its unit, coverage and exact source.</span>}
    </div>
  </div>;
}
