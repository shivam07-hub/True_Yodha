"use client"

const GITHUB_URL = "https://github.com/shivam07-hub/True_Yodha"

export function IntelCommons() {
  return (
    <section className="tm-intel-commons" aria-label="Open data commons">
      <div className="tm-intel-commons-head">
        <h3>Open by default.</h3>
        <p>The LLM chain and license — public.</p>
      </div>

      <div className="tm-intel-commons-col">
        <h4>Model</h4>
        <div className="tm-intel-commons-item">
          <span className="tm-intel-commons-k">openrouter / llama-3.3</span>
          <span className="tm-intel-commons-v">primary · free tier</span>
        </div>
        <div className="tm-intel-commons-item">
          <span className="tm-intel-commons-k">groq · llama-3.3-70b</span>
          <span className="tm-intel-commons-v">fallback 1 · fast</span>
        </div>
        <div className="tm-intel-commons-item">
          <span className="tm-intel-commons-k">gemini · flash-lite</span>
          <span className="tm-intel-commons-v">fallback 2 · resilient</span>
        </div>
        <a href="https://openrouter.ai/models" target="_blank" rel="noreferrer" className="tm-intel-commons-link">
          Provider chain →
        </a>
      </div>

      <div className="tm-intel-commons-col">
        <h4>License</h4>
        <div className="tm-intel-commons-item">
          <span className="tm-intel-commons-k">MIT</span>
          <span className="tm-intel-commons-v">code · fork freely</span>
        </div>
        <div className="tm-intel-commons-item">
          <span className="tm-intel-commons-k">PV1 · private-first</span>
          <span className="tm-intel-commons-v">user CV + profile never public</span>
        </div>
        <a href={`${GITHUB_URL}/blob/Develop/LICENSE`} target="_blank" rel="noreferrer" className="tm-intel-commons-link">
          Read terms →
        </a>
      </div>
    </section>
  )
}
