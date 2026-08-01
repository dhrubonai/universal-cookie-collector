'use client';

import { useState, useEffect, useCallback } from 'react';

interface HistoryItem {
  email: string;
  action: string;
  time: string;
}

interface StatsData {
  daily: number;
  dailyMax: number;
  total: number;
  history: HistoryItem[];
}

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(1);
  const [sendEmail, setSendEmail] = useState('');
  const [verifEmail, setVerifEmail] = useState('');
  const [verifLink, setVerifLink] = useState('');
  const [sendMsg, setSendMsg] = useState<{ type: string; text: string } | null>(null);
  const [verifMsg, setVerifMsg] = useState<{ type: string; text: string } | null>(null);
  const [sendLoading, setSendLoading] = useState(false);
  const [verifLoading, setVerifLoading] = useState(false);
  const [stats, setStats] = useState<{ daily: number; total: number }>({ daily: 0, total: 0 });
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const esc = useCallback((s: string) => {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch('/api/stats');
      const data: StatsData = await res.json();
      
      setStats({ daily: data.daily, total: data.total });
      
      if (data.history && data.history.length) {
        setHistory(data.history.filter(h => h && h.email && h.time));
      }
    } catch (_) {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const handleSendPremium = async () => {
    const email = sendEmail.trim();
    if (!email) {
      setSendMsg({ type: 'fail', text: 'Enter target email.' });
      return;
    }

    setSendLoading(true);
    setSendMsg(null);

    try {
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();

      if (res.status === 429) {
        setSendMsg({ type: 'fail', text: data.message || 'Too many requests. Please wait.' });
        return;
      }

      if (data.success) {
        setSendMsg({ 
          type: 'ok', 
          text: `Link sent to <strong>${esc(email)}</strong>. Check inbox & spam folder.` 
        });
        loadStats();
        setTimeout(() => {
          setVerifEmail(email);
          setCurrentStep(2);
        }, 1200);
      } else {
        setSendMsg({ type: 'fail', text: data.message || 'Failed' });
      }
    } catch (err: any) {
      setSendMsg({ type: 'fail', text: `Error: ${err.message}` });
    } finally {
      setSendLoading(false);
    }
  };

  const handleVerifyPremium = async () => {
    const email = verifEmail.trim();
    const link = verifLink.trim();

    if (!email) {
      setVerifMsg({ type: 'fail', text: 'Enter target email.' });
      return;
    }
    if (!link) {
      setVerifMsg({ type: 'fail', text: 'Paste the verification link from email.' });
      return;
    }

    setVerifLoading(true);
    setVerifMsg(null);

    try {
      const res = await fetch('/api/verif', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, link })
      });
      const data = await res.json();

      if (res.status === 429) {
        setVerifMsg({ type: 'fail', text: data.message || 'Too many requests. Please wait.' });
        return;
      }

      if (data.success) {
        setVerifMsg({ 
          type: 'ok', 
          text: data.message || `Account <strong>${esc(email)}</strong> is now Premium! Open Alight Motion app.` 
        });
        loadStats();
      } else {
        setVerifMsg({ type: 'fail', text: data.message || 'Failed' });
      }
    } catch (err: any) {
      setVerifMsg({ type: 'fail', text: `Error: ${err.message}` });
    } finally {
      setVerifLoading(false);
    }
  };

  const handleBack = () => {
    setCurrentStep(1);
    setVerifMsg(null);
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="loading-spin"></div>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Header */}
      <div className="head">
        <h1>Dhrubo&apos;s Alight Motion</h1>
        <p>Alight Motion Premium Activator</p>
      </div>

      {/* Stats */}
      <div className="stats">
        <div className="stat">
          <span className="stat-val">{stats.daily}</span>
          <span className="stat-lbl">Today</span>
        </div>
        <div className="stat">
          <span className="stat-val">{stats.total}</span>
          <span className="stat-lbl">Total Generated</span>
        </div>
      </div>

      {/* Steps Indicator */}
      <div className="steps">
        <span className={`dot ${currentStep === 1 ? 'active' : currentStep > 1 ? 'done' : ''}`}>1</span>
        <span className={`line ${currentStep > 1 ? 'done' : ''}`}></span>
        <span className={`dot ${currentStep === 2 ? 'active' : currentStep > 2 ? 'done' : ''}`}>2</span>
      </div>

      {/* Step 1: Send Premium Link */}
      {currentStep === 1 && (
        <div className="panel">
          <h2>Send Premium Link</h2>
          <p className="info">A verification link will be sent to the target email. Check spam folder if missing.</p>
          <input 
            type="email" 
            placeholder="target email" 
            autoComplete="off"
            value={sendEmail}
            onChange={(e) => setSendEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendPremium()}
          />
          <button 
            onClick={handleSendPremium} 
            disabled={sendLoading}
            className="primary-btn"
          >
            <span>Send Link</span>
            {sendLoading && <span className="spin"></span>}
          </button>
          {sendMsg && (
            <div className={`msg ${sendMsg.type}`} dangerouslySetInnerHTML={{ __html: sendMsg.text }}></div>
          )}
        </div>
      )}

      {/* Step 2: Verify & Activate */}
      {currentStep === 2 && (
        <div className="panel">
          <h2>Verify &amp; Activate</h2>
          <p className="info">Check your email (inbox &amp; spam), copy the verification link, then paste it below to activate premium.</p>
          <input 
            type="email" 
            placeholder="target email" 
            autoComplete="off"
            value={verifEmail}
            onChange={(e) => setVerifEmail(e.target.value)}
          />
          <input 
            type="text" 
            placeholder="https://alight-creative.firebaseapp.com/__/auth/links?link=https://alightcreative.com/auth_action/?apiKey%3DAIzaSyDrZ9jr_Y16ltSBqsQR5IH6I04FRga6Ki0%26mode%3DsignIn%26oobCode%3D..."
            value={verifLink}
            onChange={(e) => setVerifLink(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleVerifyPremium()}
          />
          <button 
            onClick={handleVerifyPremium}
            disabled={verifLoading}
            className="primary-btn"
          >
            <span>Activate Premium</span>
            {verifLoading && <span className="spin"></span>}
          </button>
          {verifMsg && (
            <div className={`msg ${verifMsg.type}`} dangerouslySetInnerHTML={{ __html: verifMsg.text }}></div>
          )}
        </div>
      )}

      {/* Back Button */}
      {currentStep > 1 && (
        <button className="back" onClick={handleBack}>← Back</button>
      )}

      {/* History Section */}
      <div className="history-wrap">
        <h3>History</h3>
        <div className="history-list">
          {history.length > 0 ? (
            history.slice(0, 50).map((item, idx) => (
              <div key={idx} className="hist-item">
                <span>
                  {esc(item.email)} <span className="hist-action">{esc(item.action || '')}</span>
                </span>
                <span className="hist-time">
                  {item.time.slice(0, 10)} {item.time.slice(11, 16)}
                </span>
              </div>
            ))
          ) : (
            <div className="hist-item" style={{ color: '#555' }}>No history yet.</div>
          )}
        </div>
      </div>

      {/* Disclaimer */}
      <div className="disc">
        <strong>Disclaimer:</strong> This website is an interface/bridge to third-party services. We are not affiliated with Alight Motion. All trademarks belong to their respective owners.
      </div>

      <style jsx global>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #111;
          color: #e5e5e5;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }

        .loading {
          position: fixed;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #111;
          z-index: 999;
        }

        .loading-spin {
          width: 32px;
          height: 32px;
          border: 3px solid #222;
          border-top-color: #2563eb;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .app {
          max-width: 420px;
          width: 100%;
        }

        .head {
          text-align: center;
          margin-bottom: 24px;
        }

        .head h1 {
          font-size: 28px;
          font-weight: 700;
          letter-spacing: -0.5px;
          color: #f0f0f0;
        }

        .head p {
          color: #777;
          font-size: 14px;
          margin-top: 4px;
        }

        .stats {
          display: flex;
          gap: 12px;
          margin-bottom: 24px;
        }

        .stat {
          flex: 1;
          background: #1a1a1a;
          border-radius: 4px;
          padding: 16px;
          text-align: center;
        }

        .stat-val {
          display: block;
          font-size: 26px;
          font-weight: 700;
          color: #f0f0f0;
        }

        .stat-lbl {
          display: block;
          font-size: 12px;
          color: #777;
          margin-top: 2px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .steps {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin-bottom: 32px;
        }

        .dot {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: #222;
          color: #666;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 600;
          transition: 0.25s;
        }

        .dot.active {
          background: #1a3a6b;
          color: #fff;
        }

        .dot.done {
          background: #1a5c3a;
          color: #fff;
        }

        .line {
          width: 40px;
          height: 3px;
          background: #222;
          border-radius: 2px;
          transition: 0.25s;
        }

        .line.done {
          background: #1a5c3a;
        }

        .panel {
          transition: 0.3s;
        }

        .panel h2 {
          font-size: 20px;
          font-weight: 600;
          margin-bottom: 8px;
          color: #f0f0f0;
        }

        .info {
          color: #777;
          font-size: 14px;
          margin-bottom: 20px;
          line-height: 1.4;
        }

        input {
          display: block;
          width: 100%;
          padding: 16px;
          font-size: 16px;
          background: #1a1a1a;
          border: none;
          border-radius: 6px;
          outline: none;
          color: #e5e5e5;
          box-shadow: inset 0 0 0 1px #2a2a2a;
          transition: box-shadow 0.2s;
          margin-bottom: 12px;
          font-family: inherit;
        }

        input:focus {
          box-shadow: inset 0 0 0 2px #2563eb;
        }

        input::placeholder {
          color: #555;
        }

        .primary-btn {
          display: flex;
          width: 100%;
          padding: 18px 16px;
          font-size: 16px;
          font-weight: 600;
          background: #2563eb;
          color: #fff;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          transition: opacity 0.2s;
          font-family: inherit;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .primary-btn:hover {
          opacity: 0.85;
        }

        .primary-btn:disabled {
          opacity: 0.3;
          cursor: default;
        }

        .spin {
          display: inline-block;
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }

        .msg {
          margin-top: 12px;
          padding: 14px;
          border-radius: 4px;
          font-size: 14px;
          word-break: break-word;
        }

        .msg.ok {
          background: #0d2218;
          color: #4ade80;
        }

        .msg.fail {
          background: #220d0d;
          color: #f87171;
        }

        .back {
          background: none;
          color: #777;
          font-weight: 500;
          padding: 12px;
          margin-top: 8px;
          width: auto;
          cursor: pointer;
          font-family: inherit;
          font-size: 16px;
        }

        .back:hover {
          color: #aaa;
          opacity: 1;
        }

        .history-wrap {
          margin-top: 8px;
        }

        .history-wrap h3 {
          font-size: 14px;
          font-weight: 600;
          color: #888;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 10px;
        }

        .history-list {
          max-height: 300px;
          overflow-y: auto;
        }

        .hist-item {
          display: flex;
          justify-content: space-between;
          padding: 10px 0;
          border-bottom: 1px solid #1a1a1a;
          font-size: 13px;
          color: #aaa;
        }

        .hist-item:last-child {
          border-bottom: none;
        }

        .hist-action {
          color: #4ade80;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }

        .hist-time {
          color: #555;
          font-size: 11px;
        }

        .disc {
          margin-top: 20px;
          padding: 14px;
          font-size: 12px;
          color: #b8960f;
          background: #1a1700;
          border-radius: 4px;
          text-align: center;
          line-height: 1.5;
        }

        @media (max-width: 480px) {
          body { padding: 16px; }
          .head h1 { font-size: 24px; }
        }
      `}</style>
    </div>
  );
}
