import {
  Chart, BarController, ScatterController, RadarController, LineController,
  BarElement, PointElement, LineElement, CategoryScale, LinearScale, LogarithmicScale, RadialLinearScale,
} from 'chart.js';
import type { Chart as ChartInstance } from 'chart.js';

// Explicit registration keeps the initial home route free of chart controllers.
Chart.register(BarController, ScatterController, RadarController, LineController, BarElement, PointElement,
  LineElement, CategoryScale, LinearScale, LogarithmicScale, RadialLinearScale);

function geometry(chart: ChartInstance, final: boolean) {
  return JSON.stringify({
    type: 'type' in chart.config ? chart.config.type : 'mixed', labels: chart.data.labels,
    animation: chart.options.animation, area: chart.chartArea,
    scales: Object.fromEntries(Object.entries(chart.scales).map(([id, scale]) => [id, { min: scale.min, max: scale.max,
      zero: scale.getPixelForValue(0), one: scale.getPixelForValue(1), labels: scale.ticks.map(tick => tick.label) }])),
    datasets: chart.data.datasets.map((dataset, index) => ({ label: dataset.label, data: dataset.data,
      fill: 'fill' in dataset ? dataset.fill : undefined, spanGaps: 'spanGaps' in dataset ? dataset.spanGaps : undefined,
      elements: chart.getDatasetMeta(index).data.map(element => {
        const keys = ['x', 'y', 'width', 'height', 'base', 'skip'];
        const props = element.getProps(keys, final);
        return Object.fromEntries(keys.map(key => [key, props[key]]));
      }),
    })),
  });
}
// Readable diagnostics come from actual Chart.js geometry and registry state,
// including detached canvases. Browser gates compare these with primary facts.
Chart.register({ id: 'axion-lifetime', afterInit() {
  document.documentElement.dataset.chartJsInstances = String(Object.keys(Chart.instances).length);
}, afterDestroy() {
  document.documentElement.dataset.chartJsInstances = String(Object.keys(Chart.instances).length);
}, afterDraw(chart) {
  chart.canvas.dataset.currentGeometry = geometry(chart, false);
}, afterRender(chart) {
  chart.canvas.dataset.chartGeometry = geometry(chart, true);
} });
export { Chart };
