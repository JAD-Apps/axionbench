/* JAD MetaBench: static, offline-capable benchmark explorer. Apache ECharts 6.1.0. */
(() => {
  'use strict';
  const DATA = window.METABENCH_DATA;
  const $ = id => document.getElementById(id);
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const DEVELOPERS = {
    openai: { name: 'OpenAI', color: '#4679ea' },
    anthropic: { name: 'Anthropic', color: '#9276df' },
    google: { name: 'Google', color: '#289c86' },
    xai: { name: 'xAI', color: '#75828e' },
    moonshot: { name: 'Moonshot AI', color: '#ae9134' }
  };
  const CAPS = {
    code: { short: 'Code', title: 'Code & implementation' },
    ui: { short: 'UI / design', title: 'UI & front-end design' },
    '3d': { short: '3D / graphics', title: '3D & graphics · proxy' },
    ops: { short: 'Operations', title: 'Operations & shell' },
    research: { short: 'Research', title: 'Research & reasoning' },
    docs: { short: 'Writing', title: 'Documentation & writing' },
    security: { short: 'Security', title: 'Security · informational' }
  };
  const capIds = Object.keys(DATA.capabilities);
  const routed = capIds.filter(c => DATA.capabilities[c].routed);
  const models = Object.fromEntries(DATA.models.map(m => [m.model, m]));
  const state = { view: 'ranking', cap: 'code', developer: 'all', selected: 'claude-opus-5-5', tokens: 100000, routeCap: 'code', profiles: ['gpt-6-luna','gpt-6.1-sol','claude-opus-5-5'], search: '', sort: 'code', descending: true };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const money = value => value === null || !Number.isFinite(value) ? '—' : '$' + (value < .1 ? value.toFixed(4) : value < 10 ? value.toFixed(3) : value.toFixed(2));
  const index = value => (value * 100).toFixed(1);
  const cost = m => Number.isFinite(m.apiUsdPerMTok) && m.apiUsdPerMTok > 0 ? m.apiUsdPerMTok * state.tokens / 1e6 : null;
  const style = m => `style="--developer-color:${DEVELOPERS[m.developer].color}"`;
  const dot = m => `<span class="dot" ${style(m)} aria-hidden="true"></span>`;
  const sourceKey = value => Object.keys(DATA.sources).find(key => value === key || value.startsWith(key + ' '));
  function sourceUrl(key, modelId) {
    // Model-specific BridgeBench results are published under this verified slug convention.
    if (key.startsWith('bb.') && modelId && models[modelId].capabilities.code?.sources.some(s => s.startsWith('bb.'))) {
      return 'https://www.bridgebench.ai/leaderboard/' + modelId.replaceAll('.', '-');
    }
    return DATA.sources[key].source;
  }
  function sourceLink(key, modelId, label) {
    const s = DATA.sources[key];
    return `<a href="${esc(sourceUrl(key, modelId))}" target="_blank" rel="noopener noreferrer">${esc(label || s.label)} <span aria-hidden="true">↗</span></a>`;
  }
  function evidenceLinks(c, modelId) {
    return c.sources.map(value => {
      const key = sourceKey(value);
      if (!key) return '';
      const suffix = value.slice(key.length).trim().replace('[vendor]', '· vendor-reported').replace('(as GPT-6 Sol)', '· GPT-6 Sol proxy');
      return sourceLink(key, modelId, DATA.sources[key].label + (suffix ? ' ' + suffix : ''));
    }).join('');
  }
  const available = () => DATA.models.filter(m => state.developer === 'all' || m.developer === state.developer);
  const ranked = () => available().filter(m => m.capabilities[state.cap]).sort((a,b) => b.capabilities[state.cap].score - a.capabilities[state.cap].score || a.name.localeCompare(b.name));
  const profileEligible = () => available().filter(m => routed.every(c => m.capabilities[c]));
  const color = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  let chart;

  try {
    const theme = localStorage.getItem('metabench.theme');
    document.documentElement.dataset.theme = theme === 'dark' || (!theme && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  } catch { document.documentElement.dataset.theme = 'light'; }
  function themeLabel() {
    const dark = document.documentElement.dataset.theme === 'dark';
    $('theme-toggle').setAttribute('aria-label', 'Switch to ' + (dark ? 'light' : 'dark') + ' theme');
    $('theme-toggle').setAttribute('aria-pressed', String(dark));
  }
  themeLabel();
  $('theme-toggle').addEventListener('click', () => {
    document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('metabench.theme', document.documentElement.dataset.theme); } catch {}
    themeLabel(); renderChart();
  });

  const date = new Date(DATA.builtAt).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric', timeZone:'UTC' });
  $('snapshot-label').textContent = 'Snapshot · ' + date;
  $('metrics').innerHTML = [[DATA.models.length, 'Models in<br>the snapshot'],[capIds.length,'Capability<br>dimensions'],[new Set(Object.values(DATA.sources).map(s => s.source)).size,'Source<br>benchmarks'],[Object.keys(DEVELOPERS).length,'Model<br>developers']].map(([n,label]) => `<div class="metric"><strong>${n}</strong><span>${label}</span></div>`).join('');
  $('hero-score').innerHTML = index(Math.max(...DATA.models.map(m=>m.capabilities.code?.score || 0)))+'<span> / 100</span>';
  $('signal-strip').innerHTML = '<span class="signal-label">SNAPSHOT LEADERS <span aria-hidden="true">→</span></span>'+routed.map(c=>{
    const leader=DATA.models.filter(m=>m.capabilities[c]).sort((a,b)=>b.capabilities[c].score-a.capabilities[c].score)[0];
    return `<button type="button" class="signal-item" data-signal="${c}" title="${esc(leader.name)} · ${CAPS[c].short}"><span>${CAPS[c].short}</span><strong>${index(leader.capabilities[c].score)}</strong><span class="signal-arrow" aria-hidden="true">↗</span></button>`;
  }).join('');
  document.querySelectorAll('[data-signal]').forEach(b=>b.addEventListener('click',()=>{state.cap=b.dataset.signal;state.view='ranking';state.developer='all';$('developer-filter').value='all';state.selected=ranked()[0].model;state.routeCap=state.cap;$('routing-capability').value=state.cap;renderExplorer();renderRouting();$('explorer').scrollIntoView({behavior:reducedMotion.matches?'instant':'smooth'});}));
  for (const [id, dev] of Object.entries(DEVELOPERS)) $('developer-filter').insertAdjacentHTML('beforeend', `<option value="${id}">${dev.name}</option>`);
  $('developer-filter').addEventListener('change', e => {
    state.developer = e.target.value;
    if (!ranked().some(m => m.model === state.selected)) state.selected = ranked()[0]?.model || available()[0]?.model;
    reconcileProfiles(); renderExplorer();
  });
  for (const id of capIds) {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.cap = id; b.textContent = CAPS[id].short;
    b.addEventListener('click', () => {
      state.cap = id;
      if (!ranked().some(m => m.model === state.selected)) state.selected = ranked()[0]?.model || available()[0]?.model;
      if (DATA.capabilities[id].routed) { state.routeCap = id; $('routing-capability').value = id; renderRouting(); }
      renderExplorer();
    });
    $('capability-tabs').append(b);
  }
  document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => {
    state.view = b.dataset.view;
    reconcileProfiles(); renderExplorer();
    $('announcement').textContent = b.textContent.trim() + ' view selected.';
  }));
  $('model-select').addEventListener('change', e => { state.selected = e.target.value; renderInspector(); });
  $('routing-capability').innerHTML = routed.map(c => `<option value="${c}">${CAPS[c].short}</option>`).join('');
  $('routing-capability').addEventListener('change', e => { state.routeCap = e.target.value; renderRouting(); });
  function setTokens(value) {
    if (!Number.isFinite(value) || value < 1000 || value > 10000000) {
      $('token-feedback').textContent = 'Enter 1,000–10,000,000 tokens.';
      $('task-tokens').setAttribute('aria-invalid', 'true');
      return;
    }
    state.tokens = Math.round(value);
    $('task-tokens').value = state.tokens;
    $('task-tokens').removeAttribute('aria-invalid');
    $('token-feedback').textContent = '';
    document.querySelectorAll('[data-tokens]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.tokens === state.tokens)));
    renderRouting(); renderInspector(); renderMatrix();
    if (state.view === 'tradeoff') renderChart();
  }
  $('task-tokens').addEventListener('input', e => setTokens(e.target.value === '' ? NaN : +e.target.value));
  document.querySelectorAll('[data-tokens]').forEach(b => b.addEventListener('click', () => setTokens(+b.dataset.tokens)));
  $('model-search').addEventListener('input', e => { state.search = e.target.value.trim().toLowerCase(); renderMatrix(); });
  function download(content, type, filename) {
    const url = URL.createObjectURL(new Blob([content], {type}));
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('announcement').textContent = filename + ' downloaded.';
  }
  const downloadJSON = () => download(JSON.stringify(DATA, null, 2) + '\n', 'application/json', 'jad-metabench-snapshot.json');
  $('download-top').addEventListener('click', downloadJSON);
  $('download-method').addEventListener('click', e => { e.preventDefault(); downloadJSON(); });
  $('download-table').addEventListener('click', () => {
    const rows = [['model','developer','blended_api_usd_per_million_tokens','estimated_task_tokens','estimated_task_cost_usd',...capIds.flatMap(c => [c+'_index',c+'_low',c+'_high',c+'_coverage'])]];
    for (const m of DATA.models) rows.push([m.name,DEVELOPERS[m.developer].name,m.apiUsdPerMTok,state.tokens,cost(m),...capIds.flatMap(c => {const v=m.capabilities[c];return v ? [index(v.score),index(v.low),index(v.high),v.coverage] : ['','','',''];})]);
    const csv = rows.map(row => row.map(v => '"' + String(v ?? '').replaceAll('"','""') + '"').join(',')).join('\r\n');
    download(csv, 'text/csv;charset=utf-8', 'jad-metabench-comparison.csv');
  });
  function reconcileProfiles() {
    const eligible = profileEligible().sort((a,b) => b.capabilities.code.score - a.capabilities.code.score);
    state.profiles = state.profiles.filter(id => eligible.some(m => m.model === id));
    if (!state.profiles.length) state.profiles = eligible.slice(0,3).map(m => m.model);
  }
  function renderProfileControls() {
    $('profile-controls').hidden = state.view !== 'profile';
    if (state.view !== 'profile') return;
    const eligible = profileEligible();
    $('profile-models').innerHTML = eligible.map(m => `<label><input type="checkbox" value="${m.model}" ${state.profiles.includes(m.model) ? 'checked' : ''}>${dot(m)}${esc(m.name)}</label>`).join('');
    $('profile-feedback').textContent = eligible.length ? 'Models without all six capability estimates are omitted from this view.' : 'No models in this filter have all six capability estimates.';
    $('profile-models').onchange = e => {
      const input = e.target;
      if (input.checked && state.profiles.length >= 3) {
        input.checked = false; $('profile-feedback').textContent = 'Choose up to 3 models. Remove one before adding another.'; return;
      }
      if (!input.checked && state.profiles.length === 1) {
        input.checked = true; $('profile-feedback').textContent = 'Keep at least one model selected.'; return;
      }
      state.profiles = input.checked ? [...state.profiles,input.value] : state.profiles.filter(id => id !== input.value);
      $('profile-feedback').textContent = 'Models without all six capability estimates are omitted from this view.';
      renderChart();
    };
  }
  function renderInspector() {
    const m = models[state.selected];
    if (!m) { $('model-detail').innerHTML = '<p class="small-note">No model available.</p>'; return; }
    const c = m.capabilities[state.cap];
    $('model-detail').innerHTML = `<div class="model-name">${esc(m.name)}</div><div class="model-developer">${dot(m)}${DEVELOPERS[m.developer].name}</div>
      <div class="score-readout">${c ? index(c.score) : '—'}<small>/ 100</small></div><div class="score-label">${CAPS[state.cap].short} capability index${c && c.high-c.low>.001 ? ' · range '+index(c.low)+'–'+index(c.high) : ''}</div>
      <div class="coverage-heading"><span>Weighted coverage</span><span>${c ? Math.round(c.coverage*100)+'%' : 'No data'}</span></div><div class="coverage-track"><span style="width:${c ? c.coverage*100 : 0}%"></span></div>
      <div class="detail-cost"><span>Estimated ${state.tokens.toLocaleString('en-US')}-token task</span><strong>${money(cost(m))}</strong></div>
      <div class="detail-sources"><p>Published source results</p>${c ? evidenceLinks(c,m.model) : '<p>No published result in this snapshot for this capability.</p>'}</div>
      ${c?.missing.length ? `<p class="detail-missing">Missing: ${c.missing.map(k => sourceLink(k,null)).join(', ')}.</p>` : ''}`;
  }
  function renderWeights() {
    const weights = DATA.capabilities[state.cap].weights;
    $('weights-strip').innerHTML = `<span>${CAPS[state.cap].short} source weights</span>` + Object.entries(weights).map(([k,w]) => sourceLink(k,null,DATA.sources[k].label) .replace('</a>',` <strong>${Math.round(w*100)}%</strong></a>`)).join('');
  }
  function renderExplorer() {
    document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed',String(b.dataset.view === state.view)));
    document.querySelectorAll('[data-cap]').forEach(b => b.setAttribute('aria-pressed',String(b.dataset.cap === state.cap)));
    const cross = state.view === 'profile' || state.view === 'heatmap';
    $('capability-tabs').hidden = cross; $('across-note').hidden = !cross;
    const inspectModels = available();
    if (!inspectModels.some(m => m.model === state.selected)) state.selected = inspectModels[0]?.model;
    $('model-select').innerHTML = inspectModels.map(m => `<option value="${m.model}" ${m.model === state.selected ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
    renderProfileControls(); renderInspector(); renderWeights(); renderChart();
  }
  function tooltipModel(m, cap) {
    const c = m.capabilities[cap];
    return `<div class="chart-tooltip"><strong>${esc(m.name)}</strong><br><span class="tooltip-muted">${DEVELOPERS[m.developer].name} · ${CAPS[cap].short}</span><br>Capability index <b>${c ? index(c.score) : '—'}</b>${c && c.high-c.low>.001 ? '<br>Missing-result range '+index(c.low)+'–'+index(c.high) : ''}<br>Weighted coverage ${c ? Math.round(c.coverage*100)+'%' : 'none'}<br>Estimated task ${money(cost(m))}${c ? '<br>'+evidenceLinks(c,m.model) : ''}</div>`;
  }
  function renderChartTable(rows) {
    const cross = state.view === 'profile' || state.view === 'heatmap';
    const columns = cross ? capIds.filter(c => state.view !== 'profile' || c !== 'security') : [state.cap];
    $('chart-data-table').innerHTML = `<caption class="sr-only">Values for the current chart view</caption><thead><tr><th>Model</th>${columns.map(c => `<th>${CAPS[c].short}</th>`).join('')}<th>Estimated task cost</th></tr></thead><tbody>${rows.map(m => `<tr><td>${esc(m.name)}</td>${columns.map(cap => { const c=m.capabilities[cap];return `<td>${c ? index(c.score)+` · ${Math.round(c.coverage*100)}% coverage`+(c.high-c.low>.001 ? ` · range ${index(c.low)}–${index(c.high)}`:'') : 'No data'}</td>`; }).join('')}<td>${money(cost(m))}</td></tr>`).join('')}</tbody>`;
  }
  function renderChart() {
    if (!window.echarts) { $('chart').innerHTML = '<p class="empty-state">The chart library could not load. Use the comparison table below.</p>'; return; }
    if (!chart) {
      chart = echarts.init($('chart'), null, {renderer:'svg'});
      chart.on('click', p => {
        const id = p.data?.modelId;
        if (!id || !models[id]) return;
        state.selected = id;
        if (state.view === 'heatmap' && p.data.cap) {
          state.cap = p.data.cap;
          if (DATA.capabilities[state.cap].routed) { state.routeCap = state.cap; $('routing-capability').value = state.cap; renderRouting(); }
          renderWeights();
        }
        $('model-select').value = state.selected; renderInspector();
      });
      new ResizeObserver(() => chart.resize()).observe($('chart'));
      reducedMotion.addEventListener('change', () => renderChart());
    }
    const fg = color('--fg'), muted = color('--chart-text'), grid = color('--chart-grid'), panel = color('--panel');
    const axis = {axisLine:{show:false},axisTick:{show:false},axisLabel:{color:muted,fontFamily:'DM Sans',fontSize:10},splitLine:{lineStyle:{color:grid,type:'dashed'}}};
    const base = {
      backgroundColor:'transparent',textStyle:{fontFamily:'DM Sans',color:fg},
      animation:!reducedMotion.matches,animationDuration:650,animationDurationUpdate:600,animationEasing:'cubicOut',animationEasingUpdate:'cubicInOut',
      tooltip:{trigger:'item',confine:true,enterable:true,backgroundColor:panel,borderColor:color('--line'),padding:14,extraCssText:'border-radius:8px;box-shadow:0 8px 28px #00000014;',textStyle:{fontFamily:'DM Sans',fontSize:11,color:fg},formatter:p => p.data?.modelId ? tooltipModel(models[p.data.modelId],p.data.cap || state.cap) : ''},
      aria:{enabled:true,description:'JAD MetaBench '+state.view+' view. A table with the same values is available immediately below the chart.'}
    };
    let rows = ranked(), option, title, subtitle, footnote;
    if (state.view === 'ranking') {
      const height = Math.max(300,rows.length*33+62); $('chart').style.height = height+'px';
      title = CAPS[state.cap].title; subtitle = 'Normalized capability index · higher is better';
      footnote = 'Whiskers show sensitivity to missing results, not confidence intervals. Click a model for its evidence. 100 = source-leader level.';
      option = {
        grid:{left:156,right:58,top:4,bottom:28},
        xAxis:{...axis,type:'value',min:0,max:100,interval:25},
        yAxis:{...axis,type:'category',inverse:true,data:rows.map(m=>m.name),splitLine:{show:false},axisLabel:{...axis.axisLabel,color:fg,fontSize:10}},
        series:[{
          id:'models',name:'Capability index',type:'bar',universalTransition:true,barWidth:14,
          data:rows.map(m => ({id:m.model,name:m.name,groupId:m.model,modelId:m.model,cap:state.cap,value:m.capabilities[state.cap].score*100,itemStyle:{color:DEVELOPERS[m.developer].color,opacity:.8,borderRadius:[0,3,3,0]}})),
          label:{show:true,position:'right',distance:10,fontSize:10,color:fg,formatter:p=>Number(p.value).toFixed(1)},
          emphasis:{itemStyle:{opacity:1}},animationDelay:i=>i*22
        },{
          id:'ranges',type:'custom',silent:true,z:10,
          renderItem:(params,api)=>{
            const lo=api.coord([api.value(0),api.value(2)]),hi=api.coord([api.value(1),api.value(2)]);
            if(hi[0]-lo[0]<1) return;
            return {type:'group',children:[{type:'line',shape:{x1:lo[0],x2:hi[0],y1:lo[1],y2:hi[1]},style:{stroke:fg,lineWidth:1.2,opacity:.65}},{type:'line',shape:{x1:lo[0],x2:lo[0],y1:lo[1]-5,y2:lo[1]+5},style:{stroke:fg,lineWidth:1.2,opacity:.65}},{type:'line',shape:{x1:hi[0],x2:hi[0],y1:hi[1]-5,y2:hi[1]+5},style:{stroke:fg,lineWidth:1.2,opacity:.65}}]};
          },data:rows.map((m,i)=>[m.capabilities[state.cap].low*100,m.capabilities[state.cap].high*100,i])
        }]
      };
    } else if (state.view === 'tradeoff') {
      rows=rows.filter(m=>cost(m)!==null); $('chart').style.height='410px';
      title = CAPS[state.cap].title; subtitle='Estimated API cost per task × capability · logarithmic cost axis';
      footnote='Upper left offers more capability for less estimated cost. Larger dots mean greater weighted coverage. Hover or click for ranges and linked results.';
      const xs=rows.map(cost), min=Math.min(...xs),max=Math.max(...xs);
      option={
        grid:{left:48,right:90,top:18,bottom:55},
        xAxis:{...axis,type:'log',min:xs.length?10**Math.floor(Math.log10(min)):0.001,max:xs.length?10**Math.ceil(Math.log10(max*1.01)):1,name:'Estimated task cost (USD)',nameLocation:'middle',nameGap:32,nameTextStyle:{color:muted,fontSize:10},axisLabel:{...axis.axisLabel,formatter:v=>'$'+(v<1?v.toPrecision(1):v)}},
        yAxis:{...axis,type:'value',min:0,max:100,interval:25,name:'Capability index',nameTextStyle:{color:muted,fontSize:10}},
        series:[{id:'models',type:'scatter',universalTransition:true,symbolSize:(value,p)=>12+p.data.coverage*12,
          data:rows.map(m=>({id:m.model,name:m.name,groupId:m.model,modelId:m.model,cap:state.cap,coverage:m.capabilities[state.cap].coverage,value:[cost(m),m.capabilities[state.cap].score*100],itemStyle:{color:DEVELOPERS[m.developer].color,opacity:.85,borderColor:panel,borderWidth:2}})),
          label:{show:true,position:'right',fontSize:9,color:muted,formatter:p=>p.name.replace('Claude ','').replace('GPT-','').replace('Gemini ','')},labelLayout:{hideOverlap:true},emphasis:{scale:1.2,label:{show:true,color:fg}}}]
      };
    } else if (state.view === 'profile') {
      rows=state.profiles.map(id=>models[id]); $('chart').style.height='370px';
      title='Capability profiles'; subtitle='Six task dimensions · point estimates on the same 0–100 index';
      footnote='Profiles compare relative strengths, not the area of each polygon. Missing capability estimates are never filled with zero. Security is excluded.';
      const profileColors=['#7fa839','#4679ea','#9276df'];
      option={
        radar:{center:['50%','48%'],radius:'68%',splitNumber:4,shape:'polygon',indicator:routed.map(c=>({name:CAPS[c].short,max:100})),axisName:{color:muted,fontSize:10},splitLine:{lineStyle:{color:grid}},splitArea:{show:false},axisLine:{lineStyle:{color:grid}}},
        legend:{bottom:0,textStyle:{color:muted,fontSize:10},icon:'roundRect',itemHeight:5,itemWidth:15,data:rows.map(m=>m.name)},
        series:[{id:'profiles',type:'radar',symbol:'circle',symbolSize:5,lineStyle:{width:2},data:rows.map((m,i)=>({name:m.name,modelId:m.model,value:routed.map(c=>m.capabilities[c].score*100),itemStyle:{color:profileColors[i]},lineStyle:{color:profileColors[i]},areaStyle:{color:profileColors[i],opacity:.055}}))}],
        tooltip:{...base.tooltip,formatter:p=>p.data?.modelId?`<div class="chart-tooltip"><strong>${esc(p.name)}</strong><br>${routed.map(c=>`${CAPS[c].short} <b>${index(models[p.data.modelId].capabilities[c].score)}</b> · ${Math.round(models[p.data.modelId].capabilities[c].coverage*100)}% coverage`).join('<br>')}<br>${sourceLink('bb.reasoning',p.data.modelId,'BridgeBench model results')}</div>`:''}
      };
    } else {
      rows=available(); $('chart').style.height=Math.max(340,rows.length*32+95)+'px';
      title='The capability landscape'; subtitle='All capabilities · color shows the normalized index';
      footnote='Empty cells have no result. Click a cell to inspect its sources, weighted coverage, and missing-result range. Security is informational.';
      option={
        grid:{left:156,right:12,top:15,bottom:75},
        xAxis:{...axis,type:'category',data:capIds.map(c=>CAPS[c].short),splitLine:{show:false},axisLabel:{...axis.axisLabel,fontSize:9,rotate:20,interval:0}},
        yAxis:{...axis,type:'category',inverse:true,data:rows.map(m=>m.name),splitLine:{show:false},axisLabel:{...axis.axisLabel,color:fg,fontSize:10}},
        visualMap:{min:0,max:100,orient:'horizontal',left:'center',bottom:0,calculable:false,itemHeight:120,itemWidth:8,text:['100','0'],textStyle:{color:muted,fontSize:9},inRange:{color:document.documentElement.dataset.theme==='dark'?['#222b35','#527266','#c8f66b']:['#edf0f5','#acbcce','#c0e674']}},
        series:[{id:'heatmap',type:'heatmap',data:rows.flatMap((m,y)=>capIds.flatMap((c,x)=>{const v=m.capabilities[c];return v?[{name:m.name,modelId:m.model,cap:c,value:[x,y,v.score*100],label:{color:document.documentElement.dataset.theme==='dark'&&v.score<.55?'#e8edf2':'#17232b'}}]:[];})),label:{show:true,fontSize:9,formatter:p=>p.data.value[2].toFixed(1)},itemStyle:{borderColor:panel,borderWidth:4},emphasis:{itemStyle:{borderColor:fg,borderWidth:2}}}]
      };
    }
    $('chart-title').textContent=title;
    $('chart-subtitle').textContent=subtitle;
    $('chart-count').textContent=rows.length+' '+(rows.length===1?'model':'models');
    $('chart-footnote').textContent=footnote;
    const legendDevelopers=[...new Set(rows.map(m=>m.developer))];
    $('chart-legend').innerHTML=state.view==='profile'?'':legendDevelopers.map(id=>`<span class="legend-item"><span class="dot" style="--developer-color:${DEVELOPERS[id].color}"></span>${DEVELOPERS[id].name}</span>`).join('')+(state.view==='ranking'?'<span class="legend-item"><span class="range-symbol" aria-hidden="true">├─┤</span>Missing-result range</span>':'');
    renderChartTable(rows);
    const empty = rows.length===0;
    if (empty) {
      option.series=[];
      option.graphic=[{type:'text',left:'center',top:'middle',style:{text:'No results for this capability and developer.\nTry another filter or inspect the complete matrix.',fill:muted,font:'12px DM Sans',textAlign:'center',lineHeight:23}}];
    }
    chart.resize(); chart.setOption({...base,...option},{notMerge:true});
  }
  function pickFor(cap, tier) {
    const candidates=DATA.models.filter(m=>m.capabilities[cap] && cost(m)!==null);
    if(!candidates.length) return null;
    const best=Math.max(...candidates.map(m=>m.capabilities[cap].score));
    const threshold=tier==='economy'?.6:tier==='balanced'?.85:1;
    return candidates.filter(m=>m.capabilities[cap].score>=best*threshold).sort((a,b)=>{
      if(tier==='frontier') return b.capabilities[cap].score-a.capabilities[cap].score || cost(a)-cost(b);
      return b.capabilities[cap].score/cost(b)-a.capabilities[cap].score/cost(a) || b.capabilities[cap].score-a.capabilities[cap].score;
    })[0];
  }
  function renderRouting() {
    const cap=state.routeCap;
    const descriptions={economy:'Capability per dollar · 60% capability threshold',balanced:'Capability per dollar · 85% capability threshold',frontier:'Highest capability · cost breaks ties'};
    const icons={economy:'↘',balanced:'◎',frontier:'✳'};
    $('routing-cards').innerHTML=['economy','balanced','frontier'].map(tier=>{
      const m=pickFor(cap,tier);
      if(!m) return '<div class="route-card"><p>No priced model results for this task.</p></div>';
      const c=m.capabilities[cap];
      return `<article class="route-card ${tier==='balanced'?'featured':''}"><div class="route-header"><h3>${tier}</h3><span class="route-icon" aria-hidden="true">${icons[tier]}</span></div><p class="route-description">${descriptions[tier]}</p><div class="route-model">${esc(m.name)}<button class="text-button inspect-route" type="button" data-model="${m.model}" aria-label="Inspect ${esc(m.name)}"><span aria-hidden="true">↗</span></button></div><div class="route-provider">${dot(m)}${DEVELOPERS[m.developer].name}</div><div class="route-metrics"><div><strong>${index(c.score)}</strong><span>${CAPS[cap].short} index / 100</span></div><div><strong>${money(cost(m))}</strong><span>estimated USD / task</span></div></div><p class="route-coverage">${Math.round(c.coverage*100)}% weighted coverage${c.high-c.low>.001?' · range '+index(c.low)+'–'+index(c.high):' · all source weights observed'}</p></article>`;
    }).join('');
    document.querySelectorAll('.inspect-route').forEach(b=>b.addEventListener('click',()=>{
      state.selected=b.dataset.model;state.developer='all';state.cap=cap;state.view='ranking';$('developer-filter').value='all';renderExplorer();$('explorer').scrollIntoView({behavior:reducedMotion.matches?'instant':'smooth'});$('model-select').focus({preventScroll:true});
    }));
  }
  function renderMatrix() {
    const columns=[['name','Model'],['cost','Task cost'],...capIds.map(c=>[c,CAPS[c].short])];
    const filtered=DATA.models.filter(m=>(m.name+' '+DEVELOPERS[m.developer].name).toLowerCase().includes(state.search));
    const sortValue=m=>state.sort==='name'?m.name:state.sort==='cost'?cost(m):m.capabilities[state.sort]?.score;
    filtered.sort((a,b)=>{
      const av=sortValue(a),bv=sortValue(b);
      if(av==null) return bv==null?0:1;
      if(bv==null) return -1;
      const delta=typeof av==='string'?av.localeCompare(bv):av-bv;
      return (state.descending?-1:1)*delta;
    });
    $('matrix-count').textContent=filtered.length;
    $('matrix-table').innerHTML=`<caption class="sr-only">Full model capability matrix. Task cost is estimated for ${state.tokens.toLocaleString()} blended tokens.</caption><thead><tr>${columns.map(([id,label])=>`<th scope="col" class="${id==='name'?'':'num'}" aria-sort="${state.sort===id?(state.descending?'descending':'ascending'):'none'}"><button type="button" data-sort="${id}">${label}</button></th>`).join('')}</tr></thead><tbody>${filtered.length?filtered.map(m=>`<tr><td class="model-cell"><button type="button" data-inspect="${m.model}">${dot(m)}${esc(m.name)}</button><small>${DEVELOPERS[m.developer].name}</small></td><td class="num">${money(cost(m))}</td>${capIds.map(c=>{const v=m.capabilities[c];return `<td class="num">${v?`<span class="score-cell" style="--intensity:${v.score}" title="Weighted coverage ${Math.round(v.coverage*100)}%">${index(v.score)}${v.high-v.low>.001?`<small>[${index(v.low)}–${index(v.high)}]</small>`:''}</span>`:'<span aria-label="No data">—</span>'}</td>`;}).join('')}</tr>`).join(''):`<tr><td colspan="${columns.length}" class="empty-state">No models match your search.</td></tr>`}</tbody>`;
    $('matrix-table').querySelectorAll('[data-sort]').forEach(b=>b.addEventListener('click',()=>{
      state.descending=state.sort===b.dataset.sort?!state.descending:b.dataset.sort!=='name'&&b.dataset.sort!=='cost';state.sort=b.dataset.sort;renderMatrix();$('matrix-table').querySelector(`[data-sort="${state.sort}"]`).focus({preventScroll:true});
    }));
    $('matrix-table').querySelectorAll('[data-inspect]').forEach(b=>b.addEventListener('click',()=>{
      state.selected=b.dataset.inspect;state.developer='all';$('developer-filter').value='all';renderExplorer();$('explorer').scrollIntoView({behavior:reducedMotion.matches?'instant':'smooth'});$('model-select').focus({preventScroll:true});
    }));
  }
  $('method-weights').innerHTML='<div class="weight-list">'+capIds.map(c=>`<div><strong>${CAPS[c].short}</strong><span>${Object.entries(DATA.capabilities[c].weights).map(([k,w])=>sourceLink(k,null,DATA.sources[k].label+' '+Math.round(w*100)+'%')).join(' · ')}</span></div>`).join('')+'</div>';
  const sourceGroups=[
    {key:'bb.reasoning',name:'BridgeBench',desc:'Reasoning, design, implementation, and reliability signals.'},
    {key:'swe.pro',name:'SWE-bench Pro',desc:'Software engineering results, as listed by BenchLM.'},
    {key:'tb.4',name:'Terminal-Bench 4.0',desc:'Terminal and operations results, as listed by BenchLM.'}
  ];
  $('source-cards').innerHTML=sourceGroups.map(s=>`<a class="source-card" href="${DATA.sources[s.key].source}" target="_blank" rel="noopener noreferrer"><span class="source-arrow" aria-hidden="true">↗</span><strong>${s.name}</strong><p>${s.desc}</p><small>Source snapshot · ${DATA.sources[s.key].snapshot}</small></a>`).join('');
  document.querySelectorAll('a[href="#pricing-method"]').forEach(a=>a.addEventListener('click',()=>{$('pricing-method').open=true;}));
  renderExplorer(); renderRouting(); renderMatrix();
  // Expose the current rendered state for reproducible browser verification, without personal data.
  window.MetaBench={getState:()=>({...state,profiles:[...state.profiles]}),getChart:()=>chart};
})();
