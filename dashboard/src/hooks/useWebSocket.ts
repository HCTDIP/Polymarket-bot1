import { useState, useEffect, useCallback, useRef } from 'react';
import type { BotState, BotConfig, LogEntry, DashboardData } from '../types';

interface WebSocketMessage { type: 'state' | 'log' | 'config' | 'full'; payload: unknown; }
const dashToken = new URLSearchParams(window.location.search).get('token');
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsBase = window.location.port === '5173' ? `${wsProtocol}//${window.location.hostname}:3001` : `${wsProtocol}//${window.location.host}`;
const WS_URL = dashToken ? `${wsBase}/?token=${encodeURIComponent(dashToken)}` : wsBase;
const MAX_LOGS = 200;

const demoConfig: BotConfig = {
  capital: { totalUsd: 250, maxPerTradePct: .02, maxPerMarketPct: .1, maxTotalExposurePct: .3, minOrderUsd: 5, strategyAllocation: { smartMoney: .6, arbitrage: .2, dipArb: .1, directTrades: .1 } },
  risk: { dailyMaxLossPct: .05, maxConsecutiveLosses: 6, pauseOnBreachMinutes: 60, monthlyMaxLossPct: .15, maxDrawdownFromPeak: .25, totalMaxLossPct: .4, maxPnlDriftUsd: 5, maxPnlDriftPct: .02 },
  smartMoney: { enabled: true, topN: 20, minWinRate: .6, minPnl: 500, minTrades: 30, customWallets: [] },
  arbitrage: { enabled: true, profitThreshold: .01, autoExecute: false },
  dipArb: { enabled: true, coins: ['BTC', 'ETH', 'SOL'] },
  directTrading: { enabled: false }, binance: { enabled: true }, dryRun: true,
};

function makeDemoState(): BotState {
  const now = Date.now();
  return {
    startTime: now - 1000 * 60 * 47, dailyPnL: 12.84, totalPnL: 38.61, consecutiveLosses: 0, consecutiveWins: 4,
    tradesExecuted: 28, wins: 22, losses: 6, isPaused: false, pauseUntil: 0, monthlyPnL: 81.4, monthStartTime: now - 86400000 * 12,
    peakCapital: 288.61, currentCapital: 288.61, currentDrawdown: 0, permanentlyHalted: false, lastDailyReset: now - 3600000,
    totalExposureUsd: 41.25, perMarketExposureUsd: { 'btc-15m': 18.25, 'eth-15m': 23 }, pnlBaselineUsdcE: 250,
    smartMoneyTrades: 14, arbTrades: 8, dipArbTrades: 6, directTrades: 0, arbProfit: 16.2,
    followedWallets: ['0x71f3...a91c', '0x8a22...f42d'], activeArbMarket: 'BTC Up or Down - 15m', activeDipArbMarket: 'ETH Up or Down - 15m',
    splits: 3, merges: 2, redeems: 1, swaps: 0, usdcBalance: 208.75, usdcEBalance: 250, maticBalance: 1.84, unrealizedPnL: 4.28,
    btcTrend: 'up', ethTrend: 'neutral', solTrend: 'down',
    dipArb: { marketName: 'ETH Up or Down - 15m', underlying: 'ETH', duration: '15m', endTime: now + 420000, upPrice: .54, downPrice: .44, sum: .98, status: 'active', lastSignal: null, signals: [] },
    arbitrage: { status: 'monitoring', marketsScanned: 126, opportunitiesFound: 9, currentMarket: 'BTC Up or Down - 15m', lastOpportunity: { timestamp: new Date(now - 180000).toISOString(), type: 'long', profitPct: .014, market: 'BTC Up or Down - 15m' } },
    smartMoneySignals: [], positions: [], paper: { balance: 288.61, initialBalance: 250, pnl: 38.61, trades: 28, totalVolume: 412.5 },
  };
}

function makeDemoLogs(): LogEntry[] {
  const now = Date.now();
  return [
    { id: 'demo-1', timestamp: new Date(now - 12000).toISOString(), level: 'SIGNAL', message: 'Arbitrage opportunity detected · +1.40%' },
    { id: 'demo-2', timestamp: new Date(now - 38000).toISOString(), level: 'TRADE', message: 'Simulation fill · BTC YES · $8.25' },
    { id: 'demo-3', timestamp: new Date(now - 95000).toISOString(), level: 'WALLET', message: 'Smart money wallet quality verified' },
    { id: 'demo-4', timestamp: new Date(now - 180000).toISOString(), level: 'INFO', message: 'Risk engine healthy · all limits within range' },
  ];
}

export function useWebSocket() {
  const [state, setState] = useState<BotState | null>(null);
  const [config, setConfig] = useState<BotConfig | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const demoTimeoutRef = useRef<number | null>(null);

  const enterDemoMode = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    setDemoMode(true); setConnected(true); setError(null); setConfig(demoConfig); setState(makeDemoState()); setLogs(makeDemoLogs());
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    try {
      const ws = new WebSocket(WS_URL);
      ws.onopen = () => { setDemoMode(false); setConnected(true); setError(null); if (demoTimeoutRef.current) window.clearTimeout(demoTimeoutRef.current); };
      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          switch (message.type) {
            case 'full': { const data = message.payload as DashboardData; if (data.state) setState(data.state); if (data.config) setConfig(data.config); if (data.logs) setLogs(data.logs.slice(0, MAX_LOGS)); break; }
            case 'state': setState(message.payload as BotState); break;
            case 'config': setConfig(message.payload as BotConfig); break;
            case 'log': setLogs((prev) => [message.payload as LogEntry, ...prev].slice(0, MAX_LOGS)); break;
          }
        } catch (parseError) { console.error('[Dashboard] Failed to parse message:', parseError); }
      };
      ws.onclose = () => { setConnected(false); wsRef.current = null; if (!demoMode) reconnectTimeoutRef.current = window.setTimeout(connect, 3000); };
      ws.onerror = () => { if (!demoMode) setError('Engine unavailable — showing product preview'); setConnected(false); };
      wsRef.current = ws;
    } catch (connectError) { setError(`Connection failed: ${String(connectError)}`); }
  }, [demoMode]);

  useEffect(() => {
    demoTimeoutRef.current = window.setTimeout(enterDemoMode, 1200);
    connect();
    return () => { if (reconnectTimeoutRef.current) window.clearTimeout(reconnectTimeoutRef.current); if (demoTimeoutRef.current) window.clearTimeout(demoTimeoutRef.current); wsRef.current?.close(); };
  }, [connect, enterDemoMode]);

  const sendCommand = (command: string, payload: unknown): boolean => {
    if (demoMode) { setCommandError(`Preview mode: ${command} is disabled until a bot engine is connected`); window.setTimeout(() => setCommandError(null), 4000); return false; }
    if (wsRef.current?.readyState === WebSocket.OPEN) { wsRef.current.send(JSON.stringify({ type: 'command', command, payload })); setCommandError(null); return true; }
    setCommandError(`"${command}" was NOT sent — dashboard is not connected to the bot`); window.setTimeout(() => setCommandError(null), 5000); return false;
  };
  return { state, config, logs, connected, demoMode, error, commandError, sendCommand };
}
