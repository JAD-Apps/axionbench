import { Component, Suspense, lazy, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';

const FrontierExperience = lazy(() => import('./observatory-experience'));

class ExperienceBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {}
  render() {
    if (this.state.failed) {
      return <section className="page-loading failure" role="alert">
        <strong>The observatory chapters could not be opened.</strong>
        <p>The preserved hero is available. Reload the page to retry the comparison experience.</p>
      </section>;
    }
    return this.props.children;
  }
}

export function Observatory() {
  const [dataStatus, setDataStatus] = useState('Loading the public evidence snapshot…');

  useEffect(() => {
    const script = document.createElement('script');
    script.src = '/assets/surface.js';
    script.async = true;
    document.body.append(script);
    return () => script.remove();
  }, []);

  return <>
    <header className="topbar">
      <a className="skip-link" href="#frontier">Skip to the frontier</a>
      <a className="wordmark" href="#top" aria-label="AxionBench home">AXION<span>BENCH</span></a>
      <nav aria-label="Main navigation">
        <a href="#frontier">Frontier</a>
        <a href="#paired">Head-to-head</a>
        <a href="#open-weights">Open weights</a>
        <a href="#models">Models</a>
        <a href="#methods">Methods</a>
      </nav>
      <span className="edition">PUBLIC EVIDENCE <i aria-hidden="true">/</i> 2026</span>
    </header>
    <main id="top">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="kicker">An observatory of model evidence</p>
          <h1 id="hero-title">See the signal.<br/><em>Keep the source.</em></h1>
          <p>Published results, aligned where the test conditions allow. Every number leads back to its evidence.</p>
          <a className="hero-link" href="#frontier">Explore the frontier <span aria-hidden="true">↘</span></a>
          <small role="status" aria-live="polite">{dataStatus}</small>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-label">FIELD NOTE <span>/</span> 01</div>
          <div className="surface-stage"><canvas id="intelligence-surface"/></div>
          <div className="art-caption"><span>MEASUREMENTS IN CONTEXT</span><span>01 — 05</span></div>
        </div>
      </section>
      <ExperienceBoundary>
        <Suspense fallback={<section className="page-loading" role="status" aria-live="polite">
          <span className="loading-indicator" aria-hidden="true"/>Preparing the public observatory…
        </section>}>
          <FrontierExperience onDatasetStatus={setDataStatus}/>
        </Suspense>
      </ExperienceBoundary>
    </main>
  </>;
}
