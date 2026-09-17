import { useMemo, useState } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import {
  Header, BalanceCards, PnLPanel, RiskPanel, TrendIndicators, StrategyGrid,
  OnChainStats, ActivityLog, ConfigPanel, ConnectionStatus, ConfirmModal,
  DipArbPanel, ArbitragePanel, SmartMoneyPanel, QuickStats, SessionSummary,
  HistoryPage, PositionsPage, StrategyControls, type ConfirmConfig,
} from './components';

type Page = 'overview' | 'history' | 'positions';

function formatUsd(value = 0) {
  return `${value >= 0 ? '+' : '-'}$${Math.abs(value).toFixed(2)}`;
}

function App() {
  const [page, setPage] = useState<Page>('overview');
  const { state, config, logs, connected, error, commandError, sendCommand } = useWebSocket();
  const [confirmState, setConfirmState] = useState<(ConfirmConfig & { resolve: (value: boolean) => void }) | null>(null);
  const isDryRun = config?.dryRun ?? true;
  const halted = state?.permanentlyHalted ?? false;
  const pnl = state?.totalPnL ?? 0;
  const exposure = state?.totalExposureUsd ?? 0;
  const exposureCap = (config?.capital.totalUsd ?? 0) * (config?.capital.maxTotalExposurePct ?? 0);
  const winRate = useMemo(() => {
    const wins = state?.wins ?? 0;
    const losses = state?.losses ?? 0;
    return wins + losses ? (wins / (wins + losses)) * 100 : 0;
  }, [state?.wins, state?.losses]);

  const confirm = (cfg: ConfirmConfig) => new Promise<boolean>((resolve) => setConfirmState({ ...cfg, resolve }));
  const toggleStrategy = (strategy: string, enabled: boolean) => sendCommand('toggleStrategy', { strategy, enabled });

  const toggleMode = async () => {
    if (isDryRun) {
      const ok = await confirm({ title: 'Enable live trading?', message: 'This will allow real orders and use real funds. Verify every limit before continuing.', confirmLabel: 'Enable live mode', danger: true });
      if (!ok) return;
    }
    sendCommand('toggleDryRun', { enabled: !isDryRun });
  };

  const emergencyStop = async () => {
    const ok = await confirm({ title: 'Emergency stop', message: 'All strategy entries will be blocked until the process is restarted.', confirmLabel: 'Stop all strategies', danger: true });
    if (ok) sendCommand('emergencyStop', {});
  };

  const panicSell = async () => {
    const ok = await confirm({ title: 'Close open positions?', message: 'This submits market sell orders for up to 10 positions in live mode.', confirmLabel: 'Close positions', danger: true });
    if (ok) sendCommand('panicSell', {});
  };

  if (page === 'history') return <HistoryPage onBack={() => setPage('overview')} />;
  if (page === 'positions') return <PositionsPage onBack={() => setPage('overview')} state={state} onClosePosition={(tokenId, size) => sendCommand('closePosition', { tokenId, size })} onRedeemPosition={(conditionId) => sendCommand('redeemPosition', { conditionId })} />;

  return (
    <div className={`app-shell ${isDryRun ? 'mode-sim' : 'mode-live'} ${halted ? 'is-halted' : ''}`}>
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <header className="product-bar">
        <div className="brand-lockup"><div className="brand-mark">P</div><div><div className="brand-name">POLYMARKET <span>OPS</span></div><div className="brand-caption">AUTONOMOUS TRADING CONSOLE</div></div></div>
        <div className="top-actions"><div className={`connection-pill ${connected ? 'online' : 'offline'}`}><i />{connected ? 'Engine online' : 'Engine offline'}</div><button className="ghost-button" onClick={() => setPage('history')}>History</button><button className="ghost-button" onClick={() => setPage('positions')}>Positions</button><button className={`mode-button ${isDryRun ? 'sim' : 'live'}`} onClick={toggleMode}>{isDryRun ? 'SIMULATION' : 'LIVE TRADING'} <span>↗</span></button></div>
      </header>
      <ConnectionStatus connected={connected} error={error} />
      {commandError && <div className="command-alert">⚠ {commandError}</div>}
      {halted && <div className="halt-alert"><strong>EMERGENCY HALT</strong><span>All new entries are blocked. Restart the bot to resume.</span></div>}

      <main className="workspace">
        <section className="hero-row"><div><div className="eyebrow">CONTROL CENTER / {isDryRun ? 'PAPER ENVIRONMENT' : 'PRODUCTION ENVIRONMENT'}</div><h1>Trading at a glance.</h1><p>One surface for signals, exposure, execution and risk.</p></div><div className="hero-status"><span className="pulse-dot" />{state?.isPaused ? 'Paused by risk guard' : halted ? 'Halted' : 'Monitoring markets'}<small>{state?.activeArbMarket || state?.activeDipArbMarket || 'Waiting for active opportunity'}</small></div></section>

        <section className="metric-strip">
          <div className="metric"><span>SESSION P&L</span><strong className={pnl >= 0 ? 'positive' : 'negative'}>{formatUsd(pnl)}</strong><small>Realized performance</small></div>
          <div className="metric"><span>EXPOSURE</span><strong>${exposure.toFixed(2)} <em>/ ${exposureCap.toFixed(2)}</em></strong><div className="meter"><i style={{ width: `${exposureCap ? Math.min(100, exposure / exposureCap * 100) : 0}%` }} /></div></div>
          <div className="metric"><span>WIN RATE</span><strong>{winRate.toFixed(1)}%</strong><small>{state?.tradesExecuted ?? 0} executions recorded</small></div>
          <div className="metric"><span>RISK STATUS</span><strong className={state?.isPaused || halted ? 'warning' : 'positive'}>{halted ? 'HALTED' : state?.isPaused ? 'PAUSED' : 'WITHIN LIMITS'}</strong><small>{state?.consecutiveLosses ?? 0} consecutive losses</small></div>
        </section>

        <div className="section-label"><span>01</span> LIVE OVERVIEW <i /></div>
        <section className="dashboard-grid top-grid"><div className="panel-span-2"><QuickStats state={state} config={config} /></div><BalanceCards state={state} config={config} /><PnLPanel state={state} config={config} /></section>
        <section className="dashboard-grid strategy-grid"><DipArbPanel state={state} /><ArbitragePanel state={state} /><div className="panel-span-2"><SmartMoneyPanel state={state} /></div></section>

        <div className="section-label"><span>02</span> RISK & EXECUTION <i /></div>
        <section className="dashboard-grid lower-grid"><div className="panel-span-2"><RiskPanel state={state} config={config} /></div><StrategyControls config={config} onToggle={toggleStrategy} onEmergencyStop={emergencyStop} onPanicSell={panicSell} halted={halted} /><TrendIndicators state={state} /><SessionSummary state={state} /><OnChainStats state={state} /></section>

        <div className="section-label"><span>03</span> OPERATIONS <i /></div>
        <section className="dashboard-grid ops-grid"><div className="panel-span-2"><ActivityLog logs={logs} /></div><StrategyGrid state={state} config={config} /></section>
        <details className="advanced"><summary>Advanced configuration <span>⌄</span></summary><ConfigPanel config={config} /></details>
      </main>
      <footer className="product-footer"><span>POLYMARKET OPS · v3.2</span><span>Risk controls are active · {connected ? 'Live telemetry connected' : 'Waiting for engine'}</span></footer>
      {confirmState && <ConfirmModal config={confirmState} onResolve={(value) => { confirmState.resolve(value); setConfirmState(null); }} />}
    </div>
  );
}

export default App;
