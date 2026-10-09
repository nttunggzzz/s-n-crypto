import express from 'express';
import http from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { runBacktestSimulation } from './src/engine/backtestEngine';
import { analyzeSectorRotations } from './src/engine/rotationEngine';
import { evaluateSetupSignal } from './src/engine/setupEngine';
import { cryptoDataService } from './server/dataProviders';
import { generateAICommitteeReport } from './server/geminiService';
import { handleTelegramBotCommand, sendTelegramNotification } from './server/telegramService';
import { SetupSignal } from './src/types/crypto';

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const PORT = 3000;

  app.use(express.json());

  // In-memory signal cache
  let cachedSignals: SetupSignal[] = [];
  let lastSignalsCompute = 0;

  async function computeAllSignals(): Promise<SetupSignal[]> {
    const now = Date.now();
    if (cachedSignals.length > 0 && now - lastSignalsCompute < 20000) {
      return cachedSignals;
    }

    const markets = await cryptoDataService.getMarkets();
    const btcCoin = markets.find(m => m.symbol === 'BTC');
    const ethCoin = markets.find(m => m.symbol === 'ETH');
    const whaleTxs = await cryptoDataService.getWhaleTransactions();
    const regime = await cryptoDataService.getMarketRegime();

    const signalPromises = markets.map(async coin => {
      const candles = await cryptoDataService.getCandles(coin.symbol, '4h', 45);
      const derivatives = await cryptoDataService.getDerivatives(coin.symbol);

      return evaluateSetupSignal({
        coin,
        candles,
        derivatives,
        whaleTxs,
        btcCoin,
        ethCoin,
        allCoins: markets,
        marketRegimeScore: regime.score
      });
    });

    const computed = await Promise.all(signalPromises);
    // Sort by Total Confluence Score descending
    computed.sort((a, b) => b.scores.totalConfluenceScore - a.scores.totalConfluenceScore);
    cachedSignals = computed;
    lastSignalsCompute = now;
    return computed;
  }

  // API Endpoints
  app.get('/api/health', (req, res) => {
    res.json({ status: 'operational', timestamp: Date.now() });
  });

  app.get('/api/crypto/regime', async (req, res) => {
    try {
      const regime = await cryptoDataService.getMarketRegime();
      res.json(regime);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to compute regime' });
    }
  });

  app.get('/api/crypto/tvl', async (req, res) => {
    try {
      const tvl = await cryptoDataService.getTVLMetrics();
      res.json(tvl);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to fetch TVL' });
    }
  });

  app.get('/api/crypto/stablecoins', async (req, res) => {
    try {
      const stablecoins = await cryptoDataService.getStablecoinMetrics();
      res.json(stablecoins);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to fetch stablecoins' });
    }
  });

  app.get('/api/crypto/markets', async (req, res) => {
    try {
      const markets = await cryptoDataService.getMarkets();
      res.json(markets);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to fetch market data' });
    }
  });

  app.get('/api/crypto/candles/:symbol', async (req, res) => {
    try {
      const symbol = req.params.symbol;
      const timeframe = (req.query.timeframe as string) || '4h';
      const limit = parseInt((req.query.limit as string) || '60', 10);
      const candles = await cryptoDataService.getCandles(symbol, timeframe, limit);
      res.json(candles);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to fetch candles' });
    }
  });

  app.get('/api/crypto/signals', async (req, res) => {
    try {
      const signals = await computeAllSignals();
      res.json(signals);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to compute signals' });
    }
  });

  app.get('/api/crypto/whales', (req, res) => {
    try {
      const whales = cryptoDataService.getWhaleTransactions();
      res.json(whales);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to fetch whale data' });
    }
  });

  app.get('/api/crypto/derivatives/:symbol', async (req, res) => {
    try {
      const symbol = req.params.symbol;
      const derivatives = await cryptoDataService.getDerivatives(symbol);
      res.json(derivatives);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to fetch derivatives data' });
    }
  });

  app.get('/api/crypto/rotations', async (req, res) => {
    try {
      const markets = await cryptoDataService.getMarkets();
      const rotations = analyzeSectorRotations(markets);
      res.json(rotations);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to fetch rotations' });
    }
  });

  app.get('/api/crypto/providers/health', (req, res) => {
    try {
      const health = cryptoDataService.getProviderHealth();
      res.json(health);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to fetch health' });
    }
  });

  app.post('/api/ai/committee', async (req, res) => {
    try {
      const { signal, marketRegime } = req.body;
      if (!signal) {
        return res.status(400).json({ error: 'Signal payload is required' });
      }
      const report = await generateAICommitteeReport(signal, marketRegime || 'BULLISH_EXPANSION');
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to generate AI report' });
    }
  });

  app.post('/api/telegram/send', async (req, res) => {
    try {
      const { signal, config } = req.body;
      if (!signal) {
        return res.status(400).json({ error: 'Signal is required' });
      }
      const result = await sendTelegramNotification(signal, config);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to send alert' });
    }
  });

  app.post('/api/telegram/command', async (req, res) => {
    try {
      const { command } = req.body;
      const signals = await computeAllSignals();
      const response = handleTelegramBotCommand(command || '/help', signals);
      res.json({ response });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to execute command' });
    }
  });

  app.post('/api/backtest/run', (req, res) => {
    try {
      const config = req.body;
      const summary = runBacktestSimulation(config);
      res.json(summary);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to run backtest' });
    }
  });

  // Codebase download endpoints for Claude Code & migration
  app.get(['/api/download/codebase', '/download-code', '/crypto_intelligence_codebase.tar.gz'], (req, res) => {
    const filePath = path.join(process.cwd(), 'crypto_intelligence_codebase.tar.gz');
    if (fs.existsSync(filePath)) {
      res.download(filePath, 'crypto_intelligence_codebase.tar.gz');
    } else {
      res.status(404).send('Codebase archive not found');
    }
  });

  app.get(['/CLAUDE.md', '/api/download/claude'], (req, res) => {
    const filePath = path.join(process.cwd(), 'CLAUDE.md');
    if (fs.existsSync(filePath)) {
      res.type('text/markdown').sendFile(filePath);
    } else {
      res.status(404).send('CLAUDE.md not found');
    }
  });

  app.get(['/PROJECT_HANDOVER_REPORT.md', '/api/download/report'], (req, res) => {
    const filePath = path.join(process.cwd(), 'PROJECT_HANDOVER_REPORT.md');
    if (fs.existsSync(filePath)) {
      res.type('text/markdown').sendFile(filePath);
    } else {
      res.status(404).send('Report not found');
    }
  });

  // Vite middleware for development / Static file serving for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Crypto Intelligence & Trading Signal Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
