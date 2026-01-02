"use client";

import { useEffect, useMemo, useState } from "react";

type PricePayload = {
  symbol: "BTC";
  currency: "USD";
  price: number;
  source: string;
  cached: boolean;
  stale: boolean;
  fetchedAt: number;
};

type RiskPayload = {
  symbol: "BTCUSDT";
  fundingRate: number;
  openInterest: number;
  risk: { level: "OK" | "WARN" | "DANGER"; reasons: string[] };
  source: "binance" | "cache" | "stale-cache";
  ts: number;
};

type Theme = "light" | "dark";
type TabKey = "overview" | "risk" | "notes";
type CategoryKey = "overview" | "market" | "futures" | "signals" | "liquidations";

function formatUSD(n: number) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return String(n);
  }
}

function formatPercent(n: number) {
  if (!Number.isFinite(n)) return String(n);
  return `${(n * 100).toFixed(3)}%`;
}

function formatNumber(n: number) {
  try {
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return String(n);
  }
}

function formatKST(ts: number) {
  const ms = ts < 10_000_000_000 ? ts * 1000 : ts;
  const d = new Date(ms);
  return d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

export default function Page() {
  const [theme, setTheme] = useState<Theme>("light");
  const [tab, setTab] = useState<TabKey>("overview");
  const [category, setCategory] = useState<CategoryKey>("market");

  const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "";
  const [data, setData] = useState<PricePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [riskData, setRiskData] = useState<RiskPayload | null>(null);
  const [riskError, setRiskError] = useState<string | null>(null);

  const prettyPrice = useMemo(() => (data ? formatUSD(data.price) : ""), [data]);
  const prettyFunding = useMemo(
    () => (riskData ? formatPercent(riskData.fundingRate) : ""),
    [riskData],
  );
  const prettyOi = useMemo(
    () => (riskData ? formatNumber(riskData.openInterest) : ""),
    [riskData],
  );

  // ✅ DOM에 이미 적용된 테마를 읽어서 state만 동기화
  useEffect(() => {
    const t = (document.documentElement.getAttribute("data-theme") as Theme) || "light";
    setTheme(t);
  }, []);

  function toggleTheme() {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    window.localStorage.setItem("theme", next);
  }

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const [priceRes, riskRes] = await Promise.all([
          fetch(`${apiBase}/api/btc`, { cache: "no-store" }),
          fetch(`${apiBase}/api/market/btc-risk`, { cache: "no-store" }),
        ]);
        if (!priceRes.ok) throw new Error(`가격 API HTTP ${priceRes.status}`);
        if (!riskRes.ok) throw new Error(`리스크 API HTTP ${riskRes.status}`);
        const json = (await priceRes.json()) as PricePayload;
        const riskJson = (await riskRes.json()) as RiskPayload;
        if (alive) {
          setData(json);
          setRiskData(riskJson);
          setError(null);
          setRiskError(null);
        }
      } catch (err) {
        if (alive) {
          const message = err instanceof Error ? err.message : "알 수 없는 오류";
          setError(message);
          setRiskError(message);
        }
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    const id = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <main className="screen pastel">
      <div className="petals" aria-hidden />
      <div className="sparkles" aria-hidden />

      <section className="card card--pastel">
        <span className="stickerTape2" aria-hidden />

        <div className="layout">
          <header className="topbar">
            <div className="brand">
              <div className="brand__logo">₿</div>
              <div className="brand__text">
                <div className="brand__title">Bit Auto</div>
                <div className="brand__sub">Futures Insight</div>
              </div>
            </div>

            <nav className="topnav" aria-label="상단 메뉴">
              <button
                className={`topnav__item ${tab === "overview" ? "topnav__item--active" : ""}`}
                onClick={() => setTab("overview")}
                type="button"
              >
                오버뷰
              </button>
              <button
                className={`topnav__item ${tab === "risk" ? "topnav__item--active" : ""}`}
                onClick={() => setTab("risk")}
                type="button"
              >
                리스크
              </button>
              <button
                className={`topnav__item ${tab === "notes" ? "topnav__item--active" : ""}`}
                onClick={() => setTab("notes")}
                type="button"
              >
                노트
              </button>
            </nav>

            <div className="topbar__right">
              <div className="pill">
                <span className="pill__dot" aria-hidden />
                <span className="pill__text">실시간</span>
              </div>

              <div className="pill pill--right">
                <span className="pill__k">갱신</span>
                <span className="pill__v">5초</span>
              </div>

              <button className="themeToggle" onClick={toggleTheme} type="button">
                <span className="themeToggle__icon" aria-hidden>
                  {theme === "dark" ? "🌙" : "☀️"}
                </span>
                <span className="themeToggle__text">
                  {theme === "dark" ? "다크" : "라이트"}
                </span>
              </button>
            </div>
          </header>

          <aside className="sidebar">
            <div className="sidebar__section">
              <div className="sidebar__label">카테고리</div>
              <button
                className={`sideitem ${category === "overview" ? "sideitem--active" : ""}`}
                onClick={() => setCategory("overview")}
                type="button"
              >
                대시보드
              </button>
              <button
                className={`sideitem ${category === "market" ? "sideitem--active" : ""}`}
                onClick={() => setCategory("market")}
                type="button"
              >
                현물 마켓
              </button>
              <button
                className={`sideitem ${category === "futures" ? "sideitem--active" : ""}`}
                onClick={() => setCategory("futures")}
                type="button"
              >
                선물
              </button>
              <button
                className={`sideitem ${category === "signals" ? "sideitem--active" : ""}`}
                onClick={() => setCategory("signals")}
                type="button"
              >
                시그널
              </button>
              <button
                className={`sideitem ${category === "liquidations" ? "sideitem--active" : ""}`}
                onClick={() => setCategory("liquidations")}
                type="button"
              >
                청산
              </button>
            </div>
          </aside>

          <div className="main">
            <div className="contentGrid">
              <section className="priceBox">
                <div className="priceBox__label">현재가 (BTC / USD)</div>

                {loading ? (
                  <div className="skeleton">
                    <div className="skeleton__bar" />
                    <div className="skeleton__bar small" />
                  </div>
                ) : error ? (
                  <div className="notice notice--error">
                    <div className="notice__title">오류</div>
                    <div className="notice__msg">{error}</div>
                  </div>
                ) : data ? (
                  <>
                    <div className="price">{prettyPrice}</div>

                    <div className="chips">
                      <span className={`chip ${data.cached ? "chip--ok" : ""}`}>
                        <span className="chip__k">캐시</span>
                        <span className="chip__v">{String(data.cached)}</span>
                      </span>
                      <span className={`chip ${data.stale ? "chip--warn" : ""}`}>
                        <span className="chip__k">지연</span>
                        <span className="chip__v">{String(data.stale)}</span>
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="notice notice--error">
                    <div className="notice__title">데이터 없음</div>
                    <div className="notice__msg">응답 값이 비어 있어요.</div>
                  </div>
                )}
              </section>

              <section className="panel">
                <div className="panel__title">상태</div>
                <div className="panel__body">
                  <div className="row">
                    <span className="k">카테고리</span>
                    <span className="v">
                      {category === "overview"
                        ? "대시보드"
                        : category === "market"
                          ? "현물"
                          : category === "futures"
                            ? "선물"
                            : category === "signals"
                              ? "시그널"
                              : "청산"}
                    </span>
                  </div>
                  <div className="row">
                    <span className="k">소스</span>
                    <span className="v">{data?.source ?? "-"}</span>
                  </div>
                  <div className="row">
                    <span className="k">업데이트</span>
                    <span className="v">{data ? formatKST(data.fetchedAt) : "-"}</span>
                  </div>
                  <div className="row">
                    <span className="k">표시</span>
                    <span className="v">현물 · 스윙</span>
                  </div>
                </div>
              </section>

              {tab === "risk" ? (
                <section className="panel">
                  <div className="panel__title">리스크 대시보드</div>
                  <div className="panel__body">
                    {loading ? (
                      <div className="row">
                        <span className="k">상태</span>
                        <span className="v">로딩 중</span>
                      </div>
                    ) : riskError ? (
                      <div className="row">
                        <span className="k">오류</span>
                        <span className="v">{riskError}</span>
                      </div>
                    ) : riskData ? (
                      <>
                        <div className="row">
                          <span className="k">펀딩</span>
                          <span className="v">{prettyFunding}</span>
                        </div>
                        <div className="row">
                          <span className="k">오픈인터레스트</span>
                          <span className="v">{prettyOi}</span>
                        </div>
                        <div className="chips">
                          <span
                            className={`chip ${
                              riskData.risk.level === "OK" ? "chip--ok" : "chip--warn"
                            }`}
                          >
                            <span className="chip__k">레벨</span>
                            <span className="chip__v">{riskData.risk.level}</span>
                          </span>
                          <span className="chip">
                            <span className="chip__k">소스</span>
                            <span className="chip__v">{riskData.source}</span>
                          </span>
                        </div>
                        <div className="row">
                          <span className="k">사유</span>
                          <span className="v">
                            {riskData.risk.reasons.length
                              ? riskData.risk.reasons.join(", ")
                              : "없음"}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="row">
                        <span className="k">데이터</span>
                        <span className="v">없음</span>
                      </div>
                    )}
                  </div>
                </section>
              ) : tab === "notes" ? (
                <section className="panel panel--soft">
                  <div className="panel__title">메모</div>
                  <div className="panel__body">
                    <div className="quote">
                      <span className="quote__icon" aria-hidden>
                        🌸
                      </span>
                      <span className="quote__text">“확신 매수보다, 분할 매수로 천천히.”</span>
                    </div>

                    <div className="miniBar">
                      <span className="miniBar__tag">MVP</span>
                      <span className="miniBar__text">최소 기능으로 빠르게 확인 중</span>
                    </div>
                  </div>
                </section>
              ) : (
                <section className="panel">
                  <div className="panel__title">요약</div>
                  <div className="panel__body">
                    <div className="row">
                      <span className="k">핵심</span>
                      <span className="v">시장/선물/시그널을 한 화면에서</span>
                    </div>
                    <div className="row">
                      <span className="k">모드</span>
                      <span className="v">Coinglass 스타일 MVP</span>
                    </div>
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>

        <footer className="footer">
          <span className="footer__left">버전 0.1</span>
          <span className="footer__right">© 나의 포트폴리오</span>
        </footer>
      </section>
    </main>
  );
}
