/* Original procedural signal sculpture: a visual identity, not benchmark data. */
(() => {
  const canvas = document.getElementById('intelligence-surface');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const stage = canvas.parentElement;
  let width = 0, height = 0, visible = true, frame = null, last = 0, phase = 0;
  let pointer = {x:0,y:0}, rotation = {x:0,y:0};
  function resize() {
    const bounds = canvas.getBoundingClientRect();
    width = bounds.width; height = bounds.height;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width*dpr); canvas.height = Math.round(height*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0); draw(phase);
  }
  function draw(t) {
    ctx.clearRect(0,0,width,height);
    if (!width || !height) return;
    const size = Math.min(width*.37,height*.43);
    const tilt = -.24 + rotation.y*.15;
    const angle = t*.12 + rotation.x*.15;
    const points = [];
    const project = (lat,lon) => {
      // A folded ellipsoid creates an original contour silhouette with a restrained rotation.
      const ripple=1+.17*Math.sin(3*lon+lat*2+t*.25);
      let x = Math.cos(lat)*Math.cos(lon)*ripple;
      let y = Math.sin(lat)*1.12;
      let z = Math.cos(lat)*Math.sin(lon)*ripple;
      const px=x*Math.cos(angle)+z*Math.sin(angle);
      z=-x*Math.sin(angle)+z*Math.cos(angle); x=px;
      const py=y*Math.cos(tilt)-z*Math.sin(tilt);
      z=y*Math.sin(tilt)+z*Math.cos(tilt); y=py;
      const perspective=3.5/(3.5-z);
      return {x:width*.5+x*size*perspective,y:height*.48+y*size*perspective,z};
    };
    // Fine guidelines align the sculpture with the page's measurement language.
    ctx.strokeStyle='#54657426';ctx.lineWidth=.5;
    for(let i=0;i<6;i++){const x=width*.14+i*width*.145;ctx.beginPath();ctx.moveTo(x,height*.06);ctx.lineTo(x,height*.92);ctx.stroke();}
    for(let i=0;i<6;i++){const y=height*.08+i*height*.17;ctx.beginPath();ctx.moveTo(width*.05,y);ctx.lineTo(width*.95,y);ctx.stroke();}
    // Latitude contours, with depth shading rather than a glow effect.
    for(let band=1;band<26;band++){
      const lat=-Math.PI/2+band*Math.PI/26;
      for(let step=0;step<90;step++){
        const lon=step*Math.PI*2/90;
        const a=project(lat,lon),b=project(lat,lon+Math.PI*2/90);
        const front=(a.z+1.2)/2.4;
        const green=band>15 && band<21;
        ctx.strokeStyle=green?`rgba(108,229,239,${.09+front*.47})`:`rgba(174,199,218,${.04+front*.32})`;
        ctx.lineWidth=green?.8:.6;
        ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
        if(step%3===0)points.push({...a,green});
      }
    }
    points.sort((a,b)=>a.z-b.z);
    for(const p of points){
      const front=(p.z+1.2)/2.4;
      ctx.fillStyle=p.green?`rgba(170,152,255,${.2+front*.8})`:`rgba(189,215,234,${.12+front*.65})`;
      ctx.beginPath();ctx.arc(p.x,p.y,.45+front*.7,0,Math.PI*2);ctx.fill();
    }
    ctx.strokeStyle='#6ce5ef70';ctx.lineWidth=.7;
    ctx.beginPath();ctx.moveTo(width*.04,height*.5);ctx.lineTo(width*.12,height*.5);ctx.moveTo(width*.5,height*.035);ctx.lineTo(width*.5,height*.09);ctx.stroke();
  }
  function tick(time) {
    if (!visible || document.hidden || motion.matches) { frame=null; return; }
    if(time-last>=32){phase+=Math.min((time-last)/1000,.05);last=time;rotation.x+=(pointer.x-rotation.x)*.04;rotation.y+=(pointer.y-rotation.y)*.04;draw(phase);}
    frame=requestAnimationFrame(tick);
  }
  function schedule() {
    if (motion.matches) { if(frame)cancelAnimationFrame(frame);frame=null;draw(0);return; }
    if(visible&&!document.hidden&&!frame){last=performance.now();frame=requestAnimationFrame(tick);}
  }
  const move = e => {const r=stage.getBoundingClientRect();pointer={x:(e.clientX-r.left)/r.width-.5,y:(e.clientY-r.top)/r.height-.5};};
  const leave = () => {pointer={x:0,y:0};};
  stage.addEventListener('pointermove', move);
  stage.addEventListener('pointerleave', leave);
  const sizeObserver = new ResizeObserver(resize); sizeObserver.observe(canvas);
  const visibilityObserver = new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;schedule();}); visibilityObserver.observe(canvas);
  function dispose() {
    visible=false; if(frame)cancelAnimationFrame(frame); frame=null;
    sizeObserver.disconnect(); visibilityObserver.disconnect();
    stage.removeEventListener('pointermove',move); stage.removeEventListener('pointerleave',leave);
    document.removeEventListener('visibilitychange',schedule); motion.removeEventListener('change',schedule);
    window.removeEventListener('axion:dispose-surface',dispose);
  }
  window.addEventListener('axion:dispose-surface',dispose);
  document.addEventListener('visibilitychange',schedule);
  motion.addEventListener('change',schedule);
  resize(); schedule();
})();
