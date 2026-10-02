import { useEffect, useRef, useState } from 'react';
import { PointElement, type ChartConfiguration, type Point } from 'chart.js';
import { Chart } from './registry';
import { useChartReducedMotion } from './reduced-motion';
import { RowDetail } from './controls';
import type { CostViewRow } from '../pricing/views';
import { trendSeries, type VersionRow } from '../versions/logic';

type Datum = number | Point | null;
type Kind = 'scatter' | 'line' | 'bar';
type Rows = CostViewRow[] | VersionRow[];
export default function ComparisonChart({ rows, view, name, selected, onSelect }: {
  rows: Rows; view: 'scatter' | 'trend' | 'paired'; name: string; selected: string; onSelect: (id: string) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const instance = useRef<Chart<Kind, Datum[], string> | null>(null);
  const previousIds = useRef<string[]>([]);
  const reduce = useChartReducedMotion();
  const [hover, setHover] = useState('');
  const detail = rows.find(r => r.id === (hover || selected));
  useEffect(() => () => { instance.current?.stop(); instance.current?.destroy(); instance.current = null; previousIds.current = []; }, [view]);
  useEffect(() => {
    if (!canvas.current) return;
    const mapped: string[][] = [];
    const ticks = { color: '#c0cadc', font: { family: '"DM Sans", sans-serif', size: 12 } };
    const grid = { color: '#263044' };
    const config: ChartConfiguration<Kind, Datum[], string> = {
      type: view === 'trend' ? 'line' : view === 'paired' ? 'bar' : 'scatter',
      data: { labels: rows.map(r => r.label), datasets: [] },
      options: { responsive: true, maintainAspectRatio: false, color: '#c0cadc',
        animation: reduce ? false : { duration: 380, easing: 'easeOutQuart' },
        events: ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove'],
        onHover(e, marks) { setHover(e.type === 'mouseout' || !marks.length ? '' : mapped[marks[0].datasetIndex]?.[marks[0].index] ?? ''); },
        onClick(_e, marks) { if (marks.length) onSelect(mapped[marks[0].datasetIndex]?.[marks[0].index] ?? ''); },
        scales: { y: { min: 0, grid, ticks, title: { display: true, text: [...new Set(rows.filter(r => r.value !== null).map(r => 'benchmarkUnit' in r ? r.benchmarkUnit : r.unit))].join(' / ') || 'No measured unit', color: '#c0cadc' } } },
      },
    };
    if (view === 'scatter') {
      const plotted = (rows as CostViewRow[]).filter(r => r.scenarioUsd !== null);
      const units = new Set(plotted.map(r => r.benchmarkUnit));
      // A panel with mixed native units cannot share a numerical y axis.
      const points = units.size <= 1 ? plotted : [];
      mapped.push(points.map(r => r.id));
      config.options!.scales!.x = { type: 'linear', min: 0, grid, ticks, title: { display: true, text: 'Scenario task cost · USD', color: '#c0cadc' } };
      config.data.labels = points.map(r => r.label);
      config.data.datasets = [{ data: points.map(r => ({ x: r.scenarioUsd!, y: r.benchmarkValue })), pointRadius: points.map(r => r.costRow.frontier ? 7 : 5),
        pointHoverRadius: 9, backgroundColor: points.map(r => r.costRow.frontier ? '#080a0f' : r.id === selected ? '#aa98ff' : '#6ce5ef'), borderColor: points.map(r => r.id === selected ? '#aa98ff' : '#6ce5ef'), borderWidth: points.map(r => r.costRow.frontier ? 2 : 1.5) }];
    } else if (view === 'trend') {
      config.options!.scales!.x = { type: 'linear', grid, ticks: { ...ticks, callback: v => new Date(Number(v)).toISOString().slice(0,10) },
        title: { display: true, text: 'Confirmed release date (UTC) · missing dates stay outside the timeline', color: '#c0cadc' } };
      const series = new Set(rows.filter(r => r.value !== null).map(r => r.unit)).size <= 1 ? trendSeries(rows as VersionRow[]) : [];
      config.data.datasets = series.map((s,i) => {
        mapped.push(s.rows.map(r => r.id));
        return { label: s.key.startsWith('isolated:') ? 'Unmatched claim' : 'Matched configuration',
          data: s.rows.map((r,j) => ({ x: Date.parse(r.releaseDate!), y: s.values[j] } as Point)),
          showLine: !s.key.startsWith('isolated:'), spanGaps: false, fill: false, tension: 0,
          pointRadius: 6, pointHoverRadius: 9, borderWidth: 2, borderColor: i % 2 ? '#aa98ff' : '#6ce5ef', backgroundColor: i % 2 ? '#aa98ff' : '#6ce5ef' };
      });
      if (!series.length) config.options!.scales!.x = { ...config.options!.scales!.x, min: 0, max: 1, ticks: { ...ticks, callback: () => '' } };
    } else {
      mapped.push(rows.map(r => r.id));
      config.options!.scales!.x = { type: 'category', grid: { display: false }, ticks };
      config.data.datasets = [{ data: rows.map(r => r.value), backgroundColor: ['#6ce5ef', '#aa98ff'], borderRadius: 5, maxBarThickness: 60 }];
    }
    if (instance.current) {
      const chart = instance.current;
      if (view === 'scatter') {
        const elements = chart.getDatasetMeta(0).data;
        const old = new Map(previousIds.current.map((id,i) => [id,elements[i]]));
        chart.getDatasetMeta(0).data = mapped[0].map(id => old.get(id) ?? Object.assign(new PointElement({}), {
          x: chart.scales.x.getPixelForValue(0), y: chart.scales.y.getPixelForValue(0), options: elements[0]?.options ?? {radius:5,hitRadius:24},
        }));
        config.data.datasets[0] = Object.assign(chart.data.datasets[0],config.data.datasets[0]);
      }
      chart.data = config.data; chart.options = config.options!;
      if (reduce) chart.stop(); chart.update(reduce ? 'none' : undefined);
    } else instance.current = new Chart(canvas.current, config);
    previousIds.current = mapped[0] ?? [];
    canvas.current.dataset.rowIds = JSON.stringify(mapped);
    setHover('');
  }, [rows, view, selected, onSelect, reduce]);
  return <div className="core-chart comparison-chart" data-testid={`${name}-chart`} data-view={view} data-reduced-motion={String(reduce)}>
    <div className="core-canvas-size" style={{ height: 350 }}><canvas ref={canvas} role="img" aria-label={`${name} ${view}; exact values and sources in the table below`}/></div>
    {new Set(rows.filter(r => r.value !== null).map(r => 'benchmarkUnit' in r ? r.benchmarkUnit : r.unit)).size > 1 && <p>These claims use different native units. Use the table; a shared numerical axis is unavailable.</p>}
    <div className="core-tooltip" role="status" aria-live="polite" data-testid={`${name}-tooltip`}>{detail ? <RowDetail row={detail}/> : 'Point to a mark or focus a model below for its values, units and sources.'}</div>
  </div>;
}
