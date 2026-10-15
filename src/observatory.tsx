import { Component, Suspense, lazy, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import { findRoute, routes } from './routes';

const FrontierExperience = lazy(() => import('./observatory-experience'));

class ExperienceBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(_error: Error, _info: ErrorInfo) {}
  render() {
    if (this.state.failed) return <section className="page-loading failure" role="alert">
      <strong>This comparison could not be opened.</strong><p>Reload to retry loading the public snapshot.</p>
    </section>;
    return this.props.children;
  }
}

function Hero({ status }: { status: string }) {
  useEffect(() => {
    const script = document.createElement('script');
    script.src = '/assets/surface.js'; script.async = true; document.body.append(script);
    return () => { window.dispatchEvent(new Event('axion:dispose-surface')); script.remove(); };
  }, []);
  return <section className="hero" aria-labelledby="hero-title">
    <div className="hero-copy">
      <p className="kicker">Capability × coverage × task cost</p>
      <h1 id="hero-title">Find your<br/>next model<span className="hero-dot">.</span></h1>
      <p>Compare what models can do.<br/>See what your task could cost.</p>
      <div className="hero-actions"><a className="hero-link" href="#task-comparison">Compare for your task <span aria-hidden="true">↘</span></a>
        <a href="/rankings">Explore rankings ↗</a></div>
      <small role="status" aria-live="polite">{status}</small>
    </div>
    <div className="hero-art" aria-hidden="true">
      <div className="art-label">01 / THE MODEL FIELD <span>AXIONBENCH</span></div>
      <div className="surface-stage"><canvas id="intelligence-surface"/></div>
      <div className="art-caption"><span>ORIGINAL CONTOUR STUDY</span><span>COMPARE THE EVIDENCE ↓</span></div>
    </div>
  </section>;
}

export function Observatory() {
  const [locationKey, setLocationKey] = useState(() => location.pathname + location.search);
  const [restoration, setRestoration] = useState(0);
  const [dataStatus, setDataStatus] = useState('Loading the public evidence snapshot…');
  const route = findRoute(location.pathname);
  useEffect(() => {
    let frame = 0;
    function restore() {
      setLocationKey(location.pathname + location.search);
      // A Back after hard reload can restore the same URL as this shell's
      // initial key, while mounted controls have since changed via pushState.
      // Always restore the route's URL state, even when that key is identical.
      setRestoration(value => value + 1);
      frame = requestAnimationFrame(() => {
        const fragment = location.hash.slice(1);
        const target = (fragment && document.getElementById(fragment)) || document.getElementById('route-title');
        target?.focus({ preventScroll: true });
        if (fragment && target?.id === fragment) target.scrollIntoView({ block: 'start', behavior: 'instant' });
        else window.scrollTo({ top: 0, behavior: 'instant' });
      });
    }
    function navigate(event: MouseEvent) {
      const anchor = (event.target as Element).closest('a');
      if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
        || anchor.target || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href);
      if (url.origin !== location.origin || !findRoute(url.pathname) || url.hash || url.pathname === location.pathname) return;
      event.preventDefault(); history.pushState(null, '', url); restore();
    }
    document.addEventListener('click', navigate); window.addEventListener('popstate', restore);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('click', navigate); window.removeEventListener('popstate', restore); };
  }, []);
  useEffect(() => {
    document.title = (route?.title ?? 'Page not found') + ' — AxionBench';
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', 'https://axionbench.jadapps.app' + (route?.path ?? location.pathname));
  }, [route, locationKey]);
  return <>
    <header className="topbar">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <a className="wordmark" href="/" aria-label="AxionBench home"><span className="brand-symbol">∿</span> AXION<span>BENCH</span></a>
      <span className="edition">MODEL COMPARISONS <i aria-hidden="true">/</i> PUBLIC DATA</span>
      <nav aria-label="Main navigation">{routes.map(item => <a key={item.id} href={item.path} onFocus={event => event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })} aria-current={item.id === route?.id ? 'page' : undefined}>{item.title}</a>)}</nav>
    </header>
    <main id="main-content" tabIndex={-1}>
      <div className={'route-heading' + (route?.id === 'overview' ? ' overview-heading' : '')}>
        <p className="eyebrow">AxionBench / {route?.title ?? '404'}</p>
        <h1 id="route-title" tabIndex={-1}>{route?.title ?? 'Page not found'}</h1>
        {route?.id !== 'overview' && <p>{route?.description ?? 'There is no comparison at this address.'}</p>}
      </div>
      {route?.id === 'overview' && <Hero status={dataStatus}/>}
      {route ? <ExperienceBoundary key={locationKey + '|' + restoration}>
        <Suspense fallback={<section className="page-loading" role="status"><span className="loading-indicator" aria-hidden="true"/>Preparing the comparison…</section>}>
          <FrontierExperience route={route.id} onDatasetStatus={setDataStatus}/>
        </Suspense>
      </ExperienceBoundary> : <p className="page-loading"><a href="/">Return to overview ↗</a></p>}
    </main>
    <footer><span>AXIONBENCH / PUBLIC MODEL EVIDENCE</span><a href="/methods">How comparisons work</a><a href="/privacy.html">Privacy</a><a href="#main-content">Back to top ↑</a></footer>
  </>;
}
