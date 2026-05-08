import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import * as path from 'path';
import { PetriNet } from '../routing/index';
import { CortexFlowOrchestrator } from '../routing/orchestrator';
import { ToolRegistry } from '../execution/registry';

export class PetriWebServer {
  private app: express.Application;
  private server: any;
  private io: any;
  private orchestrator?: CortexFlowOrchestrator;
  private sessionId?: string;

  constructor(private port: number = 3001) {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new Server(this.server);
    this.setupRoutes();
    this.setupSocket();
  }

  setOrchestrator(orchestrator: CortexFlowOrchestrator, sessionId?: string) {
    this.orchestrator = orchestrator;
    this.sessionId = sessionId;
  }

  private setupRoutes() {
    // Serve static HTML
    this.app.get('/', (_req, res) => {
      res.send(this.getHTML());
    });

    // API: Get current state
    this.app.get('/api/state', (_req, res) => {
      if (!this.orchestrator) {
        res.json({ error: 'No orchestrator set' });
        return;
      }
      const net = this.orchestrator.petri;
      const marking = (net as any).state.marking as Map<string, any[]>;
      const places = Array.from(net.places.entries()).map(([id, place]) => ({
        id,
        type: place.type,
        tokens: marking.get(id)?.length || 0,
        tokenDetails: marking.get(id) || [],
      }));
      const transitions = Array.from(net.transitions.entries()).map(([id, trans]) => ({
        id,
        from: trans.from,
        to: trans.to,
        description: (trans as any).description || id,
      }));
      const enabled = net.getEnabledTransitions();

      res.json({
        name: net.name,
        places,
        transitions,
        enabledTransitions: enabled,
        history: (net as any).state.history || [],
      });
    });

    // API: Fire transition
    this.app.post('/api/fire/:transitionId', async (req, res) => {
      if (!this.orchestrator || !this.sessionId) {
        res.json({ error: 'No orchestrator/session' });
        return;
      }
      try {
        const result = await this.orchestrator.fire(req.params.transitionId, this.sessionId);
        this.io.emit('stateUpdate', await this.getState());
        res.json(result);
      } catch (error) {
        res.json({ error: (error as Error).message });
      }
    });

    // API: Get DOT
    this.app.get('/api/dot', (_req, res) => {
      if (!this.orchestrator) {
        res.json({ error: 'No orchestrator set' });
        return;
      }
      res.type('text/vnd.graphviz').send(this.orchestrator.petri.toDot());
    });
  }

  private setupSocket() {
    this.io.on('connection', (socket: any) => {
      console.log('Web client connected');
      socket.emit('stateUpdate', this.getState());
    });
  }

  private async getState() {
    if (!this.orchestrator) return { error: 'No orchestrator set' };
    const net = this.orchestrator.petri;
    const marking = (net as any).state.marking as Map<string, any[]>;
    const places = Array.from(net.places.entries()).map(([id, place]) => ({
      id,
      type: place.type,
      tokens: marking.get(id)?.length || 0,
      tokenDetails: marking.get(id) || [],
    }));
    const transitions = Array.from(net.transitions.entries()).map(([id, trans]) => ({
      id,
      from: trans.from,
      to: trans.to,
      description: (trans as any).description || id,
    }));
    const enabled = net.getEnabledTransitions();

    return {
      name: net.name,
      places,
      transitions,
      enabledTransitions: enabled,
      history: (net as any).state.history || [],
    };
  }

  start() {
    this.server.listen(this.port, () => {
      console.log(`🌐 Petri Web Interface running at http://localhost:${this.port}`);
    });
  }

  stop() {
    this.server.close();
  }

  private getHTML(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <title>CortexFlow Petri Visualizer</title>
  <script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/viz.js@2.1.2/viz.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/viz.js@2.1.2/full.render.js"></script>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
    .container { display: flex; gap: 20px; }
    .panel { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .left { flex: 1; }
    .right { flex: 2; }
    h2 { margin-top: 0; color: #333; }
    .place { padding: 10px; margin: 5px 0; background: #e3f2fd; border-left: 4px solid #2196F3; }
    .place.initial { border-left-color: #4CAF50; }
    .place.final { border-left-color: #F44336; }
    .token-count { display: inline-block; background: #2196F3; color: white; border-radius: 50%; width: 24px; height: 24px; text-align: center; line-height: 24px; margin-left: 10px; }
    .transition { padding: 10px; margin: 5px 0; background: #fff3e0; border-left: 4px solid #FF9800; cursor: pointer; }
    .transition.enabled { background: #e8f5e9; border-left-color: #4CAF50; }
    .dot-container { background: white; padding: 10px; border: 1px solid #ddd; min-height: 400px; }
    button { padding: 8px 16px; margin: 5px; cursor: pointer; background: #2196F3; color: white; border: none; border-radius: 4px; }
    button:hover { background: #1976D2; }
    .history { font-size: 12px; color: #666; max-height: 200px; overflow-y: auto; }
  </style>
</head>
<body>
  <h1>🕸 CortexFlow Petri Visualizer</h1>
  <div class="container">
    <div class="panel left">
      <h2>Places & Tokens</h2>
      <div id="places"></div>
      <h2>Transitions</h2>
      <div id="transitions"></div>
      <h2>History</h2>
      <div id="history" class="history"></div>
    </div>
    <div class="panel right">
      <h2>Graph Visualization (DOT)</h2>
      <div>
        <button onclick="refreshDot()">Refresh DOT</button>
        <button onclick="fireTransition(prompt('Transition ID?'))">Fire Transition</button>
      </div>
      <div id="dot" class="dot-container"></div>
    </div>
  </div>

  <script>
    const socket = io();
    let currentState = {};

    socket.on('stateUpdate', (state) => {
      currentState = state;
      updatePlaces(state.places || []);
      updateTransitions(state.transitions || [], state.enabledTransitions || []);
      updateHistory(state.history || []);
      updateDot();
    });

    function updatePlaces(places) {
      const div = document.getElementById('places');
      div.innerHTML = places.map(p => {
        const cls = p.type === 'initial' ? 'initial' : p.type === 'final' ? 'final' : '';
        return '<div class="place ' + cls + '">' +
          '<strong>' + p.id + '</strong> (' + p.type + ')' +
          '<span class="token-count">' + p.tokens + '</span>' +
          '</div>';
      }).join('');
    }

    function updateTransitions(transitions, enabled) {
      const div = document.getElementById('transitions');
      div.innerHTML = transitions.map(t => {
        const isEnabled = enabled.includes(t.id);
        return '<div class="transition ' + (isEnabled ? 'enabled' : '') + '" onclick="fireTransition(\'' + t.id + '\')">' +
          '<strong>' + t.description + '</strong> (' + t.id + ')' +
          (isEnabled ? ' ✅ ENABLED' : '') +
          '</div>';
      }).join('');
    }

    function updateHistory(history) {
      const div = document.getElementById('history');
      div.innerHTML = history.slice(-10).map((h, i) => (history.length - 10 + i) + ': ' + h).join('<br>');
    }

    function updateDot() {
      fetch('/api/dot')
        .then(r => r.text())
        .then(dot => {
          try {
            const result = Viz(dot, { format: 'svg', engine: 'dot' });
            document.getElementById('dot').innerHTML = result;
          } catch (e) {
            document.getElementById('dot').innerHTML = '<pre>' + dot + '</pre><p>Error rendering: ' + e + '</p>';
          }
        });
    }

    function fireTransition(id) {
      if (!id) return;
      fetch('/api/fire/' + id, { method: 'POST' })
        .then(() => console.log('Fired:', id))
        .catch(e => alert('Error: ' + e));
    }

    function refreshDot() {
      updateDot();
    }

    // Initial load
    fetch('/api/state')
      .then(r => r.json())
      .then(state => {
        currentState = state;
        updatePlaces(state.places || []);
        updateTransitions(state.transitions || [], state.enabledTransitions || []);
        updateHistory(state.history || []);
        updateDot();
      });
  </script>
</body>
</html>`;
  }
}
