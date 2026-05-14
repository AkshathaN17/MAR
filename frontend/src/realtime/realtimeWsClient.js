const DEFAULT_INFER_TIMEOUT_MS = 120000;
const DEFAULT_INGEST_TIMEOUT_MS = 60000;

export class RealtimeWsClient {
  /**
   * @param {string} wsUrl e.g. ws://localhost:5000/realtime/ws
   */
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    /** @type {WebSocket | null} */
    this.ws = null;
    this.pending = new Map();
    this.nextId = 1;
    this.messageHandler = this._onMessage.bind(this);
  }

  connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.wsUrl);
      this.ws = socket;
      socket.onopen = () => resolve();
      socket.onerror = () => reject(new Error("WebSocket connection failed"));
      socket.onmessage = this.messageHandler;
      socket.onclose = () => {
        for (const [, p] of this.pending) {
          p.reject(new Error("WebSocket closed"));
        }
        this.pending.clear();
      };
    });
  }

  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  _onMessage(ev) {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (msg.type === "infer_result" && msg.requestId != null) {
      const p = this.pending.get(msg.requestId);
      if (p) {
        clearTimeout(p.timer);
        this.pending.delete(msg.requestId);
        p.resolve(msg);
      }
      return;
    }
    if (msg.type === "ingest_window_ok" && msg.requestId != null) {
      const p = this.pending.get(msg.requestId);
      if (p) {
        clearTimeout(p.timer);
        this.pending.delete(msg.requestId);
        p.resolve(msg);
      }
      return;
    }
    if (msg.type === "ingest_session_ok" && msg.requestId != null) {
      const p = this.pending.get(msg.requestId);
      if (p) {
        clearTimeout(p.timer);
        this.pending.delete(msg.requestId);
        p.resolve(msg);
      }
      return;
    }
    if (msg.type === "error") {
      if (msg.requestId != null) {
        const p = this.pending.get(msg.requestId);
        if (p) {
          clearTimeout(p.timer);
          this.pending.delete(msg.requestId);
          p.reject(new Error(msg.message || "server_error"));
        }
      }
      return;
    }
  }

  infer(payload) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("WebSocket not connected"));
    }
    const requestId = String(this.nextId++);
    const body = { type: "infer", requestId, ...payload };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error("infer_timeout"));
      }, DEFAULT_INFER_TIMEOUT_MS);
      this.pending.set(requestId, { resolve, reject, timer });
      this.ws.send(JSON.stringify(body));
    });
  }

  ingestWindow(payload) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("WebSocket not connected"));
    }
    const requestId = String(this.nextId++);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error("ingest_window_timeout"));
      }, DEFAULT_INGEST_TIMEOUT_MS);
      this.pending.set(requestId, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ type: "ingest_window", requestId, payload }));
    });
  }

  ingestSession(payload) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("WebSocket not connected"));
    }
    const requestId = String(this.nextId++);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error("ingest_session_timeout"));
      }, DEFAULT_INGEST_TIMEOUT_MS);
      this.pending.set(requestId, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ type: "ingest_session", requestId, payload }));
    });
  }
}
