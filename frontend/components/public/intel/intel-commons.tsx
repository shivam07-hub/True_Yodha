"use client"

export function IntelCommons() {
  return (
    <section className="tm-intel-commons" aria-label="Open data commons">
      <div className="tm-intel-commons-head">
        <h3>An open data commons for careers.</h3>
        <p>Model, code, and data — all free to fork.</p>
      </div>
      <div className="tm-intel-commons-col">
        <h4>Model</h4>
        <div className="tm-intel-commons-item">
          <span className="tm-intel-commons-k">gpt-oss-120b</span>
          <span className="tm-intel-commons-v">120B · Apache-2.0</span>
        </div>
        <div className="tm-intel-commons-item">
          <span className="tm-intel-commons-k">finetune · v0.4.2</span>
          <span className="tm-intel-commons-v">jobs-parse, last sat</span>
        </div>
        <a href="#" className="tm-intel-commons-link">Inspect weights →</a>
      </div>
      <div className="tm-intel-commons-col">
        <h4>Code</h4>
        <div className="tm-intel-commons-item">
          <span className="tm-intel-commons-k">myro/career-intel</span>
          <span className="tm-intel-commons-v">Python · Go · MIT</span>
        </div>
        <div className="tm-intel-commons-item">
          <span className="tm-intel-commons-k">main · a8f3c12</span>
          <span className="tm-intel-commons-v">1h ago · 47 contributors</span>
        </div>
        <a href="#" className="tm-intel-commons-link">github →</a>
      </div>
      <div className="tm-intel-commons-col">
        <h4>Data</h4>
        <div className="tm-intel-commons-item">
          <span className="tm-intel-commons-k">Firebase / firestore</span>
          <span className="tm-intel-commons-v">live mirror · streaming</span>
        </div>
        <div className="tm-intel-commons-item">
          <span className="tm-intel-commons-k">Parquet mirror</span>
          <span className="tm-intel-commons-v">refreshed nightly</span>
        </div>
        <a href="#" className="tm-intel-commons-link">Download dump →</a>
      </div>
      <div className="tm-intel-commons-col">
        <h4>License</h4>
        <div className="tm-intel-commons-item">
          <span className="tm-intel-commons-k">MIT</span>
          <span className="tm-intel-commons-v">use it anywhere</span>
        </div>
        <div className="tm-intel-commons-item">
          <span className="tm-intel-commons-k">CC-BY-4.0</span>
          <span className="tm-intel-commons-v">data only</span>
        </div>
        <a href="#" className="tm-intel-commons-link">Read terms →</a>
      </div>
    </section>
  )
}
