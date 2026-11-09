export function getAdminLoginHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dr. Papi Dental AI • Admin Login</title>
  <style>
    :root {
      --bg: #0a0f1d;
      --panel: rgba(15, 23, 42, 0.9);
      --panel-alt: rgba(30, 41, 59, 0.88);
      --accent: #38bdf8;
      --accent-strong: #0ea5e9;
      --border: rgba(148, 163, 184, 0.2);
      --text: #e2e8f0;
      --muted: #94a3b8;
      --success: #10b981;
      --danger: #ef4444;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif;
      background: radial-gradient(circle at top, rgba(56, 189, 248, 0.18), transparent 35%), #0a0f1d;
      color: var(--text);
    }
    .login-shell {
      width: min(460px, calc(100% - 24px));
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 20px;
      box-shadow: 0 20px 50px rgba(2, 6, 23, 0.7);
      padding: 28px;
    }
    .eyebrow {
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--accent);
      font-size: 11px;
      font-weight: 700;
      margin-bottom: 10px;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 2rem;
    }
    p {
      color: var(--muted);
      margin: 0 0 24px;
      line-height: 1.5;
    }
    label {
      display: block;
      margin-bottom: 8px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--muted);
    }
    input {
      width: 100%;
      padding: 13px 14px;
      margin-bottom: 18px;
      background: rgba(15, 23, 42, 0.9);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 12px;
      font-size: 15px;
    }
    input:focus {
      outline: none;
      border-color: rgba(56, 189, 248, 0.8);
      box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.18);
    }
    button {
      width: 100%;
      padding: 13px 16px;
      border: none;
      border-radius: 12px;
      background: linear-gradient(135deg, var(--accent-strong), var(--accent));
      color: white;
      font-weight: 700;
      font-size: 15px;
      cursor: pointer;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      box-shadow: 0 12px 24px rgba(14, 165, 233, 0.28);
    }
    button:hover {
      transform: translateY(-1px);
    }
    #message {
      margin-top: 18px;
      min-height: 20px;
      font-size: 14px;
      color: var(--muted);
    }
    #message.error { color: var(--danger); }
    #message.success { color: var(--success); }
    .footer-note {
      margin-top: 18px;
      text-align: center;
      color: var(--muted);
      font-size: 12px;
    }
    .google-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      margin-top: 18px;
      padding: 13px 16px;
      border-radius: 12px;
      background: rgba(15, 23, 42, 0.9);
      border: 1px solid var(--border);
      color: var(--text);
      text-decoration: none;
      font-weight: 700;
      font-size: 15px;
      transition: transform 0.2s ease, border-color 0.2s ease;
    }
    .google-button:hover {
      transform: translateY(-1px);
      border-color: rgba(56, 189, 248, 0.8);
    }
    .divider {
      margin: 18px 0 10px;
      display: flex;
      align-items: center;
      gap: 12px;
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .divider::before,
    .divider::after {
      content: "";
      flex: 1;
      height: 1px;
      background: var(--border);
    }
  </style>
</head>
<body>
  <div class="login-shell">
    <div class="eyebrow">Secure Access</div>
    <h1>Admin login</h1>
    <p>Use your email and password or continue with your Google account.</p>

    <form id="loginForm">
      <div>
        <label for="email">Email</label>
        <input id="email" name="email" type="email" autocomplete="email" required>
      </div>

      <div>
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required>
      </div>

      <button type="submit">Sign in</button>
      <div id="message"></div>
    </form>

    <div class="divider">or</div>
    <a class="google-button" href="/admin/auth/google">Continue with Google</a>

    <div class="footer-note">Need a new admin account? Create it in the database with the AdminUser table, then log in here.</div>
  </div>

  <script>
    const form = document.getElementById('loginForm');
    const message = document.getElementById('message');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      message.className = '';
      message.textContent = 'Signing in...';

      const payload = {
        email: document.getElementById('email').value,
        password: document.getElementById('password').value,
      };

      try {
        const response = await fetch('/admin/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          credentials: 'same-origin',
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.message || 'Invalid email or password.');
        }

        message.className = 'success';
        message.textContent = 'Login successful. Redirecting...';
        window.location.href = '/admin/dashboard';
      } catch (error) {
        message.className = 'error';
        message.textContent = error.message || 'Unable to sign in.';
      }
    });
  </script>
</body>
</html>`;
}

export function getAdminDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dr. Papi Dental AI • Admin Command Center</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-primary: #0a0e17;
      --bg-secondary: #0f172a;
      --bg-card: rgba(17, 24, 39, 0.75);
      --bg-card-hover: rgba(30, 41, 59, 0.85);
      --border-color: rgba(255, 255, 255, 0.08);
      --border-color-glow: rgba(56, 189, 248, 0.25);
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --text-dim: #64748b;
      --primary: #0ea5e9;
      --primary-hover: #38bdf8;
      --primary-glow: rgba(14, 165, 233, 0.25);
      --emerald: #10b981;
      --emerald-glow: rgba(16, 185, 129, 0.2);
      --indigo: #6366f1;
      --indigo-glow: rgba(99, 102, 241, 0.25);
      --amber: #f59e0b;
      --rose: #ef4444;
      --radius-sm: 8px;
      --radius-md: 12px;
      --radius-lg: 16px;
      --radius-xl: 20px;
      --shadow-glass: 0 10px 30px -10px rgba(0, 0, 0, 0.5), 0 0 1px 1px rgba(255, 255, 255, 0.08) inset;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background-color: var(--bg-primary);
      color: var(--text-main);
      min-height: 100vh;
      overflow-x: hidden;
      line-height: 1.5;
      background-image: 
        radial-gradient(at 10% 20%, rgba(14, 165, 233, 0.08) 0px, transparent 50%),
        radial-gradient(at 90% 10%, rgba(99, 102, 241, 0.08) 0px, transparent 50%),
        radial-gradient(at 50% 90%, rgba(16, 185, 129, 0.05) 0px, transparent 50%);
      background-attachment: fixed;
    }

    ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    ::-webkit-scrollbar-track {
      background: var(--bg-primary);
    }
    ::-webkit-scrollbar-thumb {
      background: #334155;
      border-radius: 4px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: #475569;
    }

    .navbar {
      position: sticky;
      top: 0;
      z-index: 100;
      backdrop-filter: blur(20px);
      background: rgba(10, 14, 23, 0.85);
      border-bottom: 1px solid var(--border-color);
      padding: 14px 28px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .brand-section {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .logo-container {
      width: 44px;
      height: 44px;
      border-radius: var(--radius-md);
      background: linear-gradient(135deg, #0ea5e9, #6366f1);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      box-shadow: 0 0 20px rgba(14, 165, 233, 0.4);
    }

    .brand-title {
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-size: 19px;
      font-weight: 700;
      letter-spacing: -0.02em;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .brand-badge {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      padding: 3px 8px;
      border-radius: 6px;
      background: rgba(14, 165, 233, 0.15);
      color: var(--primary);
      border: 1px solid rgba(14, 165, 233, 0.3);
    }

    .brand-sub {
      font-size: 12px;
      color: var(--text-muted);
    }

    .nav-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .live-sync-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.25);
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 600;
      color: var(--emerald);
    }

    .pulse-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--emerald);
      box-shadow: 0 0 10px var(--emerald);
      animation: pulse 2s infinite ease-in-out;
    }

    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.3); opacity: 0.5; }
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 8px 16px;
      border-radius: var(--radius-sm);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      border: none;
      outline: none;
      text-decoration: none;
    }

    .btn-primary {
      background: linear-gradient(135deg, #0ea5e9, #0284c7);
      color: white;
      box-shadow: 0 4px 14px var(--primary-glow);
    }

    .btn-primary:hover {
      background: linear-gradient(135deg, #38bdf8, #0ea5e9);
      box-shadow: 0 6px 20px rgba(14, 165, 233, 0.4);
      transform: translateY(-1px);
    }

    .btn-emerald {
      background: linear-gradient(135deg, #10b981, #059669);
      color: white;
      box-shadow: 0 4px 14px var(--emerald-glow);
    }

    .btn-emerald:hover {
      background: linear-gradient(135deg, #34d399, #10b981);
      transform: translateY(-1px);
    }

    .btn-secondary {
      background: rgba(30, 41, 59, 0.8);
      color: var(--text-main);
      border: 1px solid var(--border-color);
    }

    .btn-secondary:hover {
      background: rgba(51, 65, 85, 0.9);
      border-color: rgba(255, 255, 255, 0.2);
    }

    .btn-danger {
      background: rgba(239, 68, 68, 0.15);
      color: var(--rose);
      border: 1px solid rgba(239, 68, 68, 0.3);
    }

    .btn-danger:hover {
      background: rgba(239, 68, 68, 0.25);
    }

    .btn-sm {
      padding: 5px 10px;
      font-size: 12px;
      border-radius: 6px;
    }

    .dashboard-container {
      max-width: 1440px;
      margin: 0 auto;
      padding: 24px 28px 60px;
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 18px;
      margin-bottom: 28px;
    }

    .metric-card {
      background: var(--bg-card);
      backdrop-filter: blur(16px);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      padding: 20px 22px;
      box-shadow: var(--shadow-glass);
      transition: all 0.25s ease;
      position: relative;
      overflow: hidden;
    }

    .metric-card:hover {
      border-color: rgba(255, 255, 255, 0.16);
      transform: translateY(-2px);
    }

    .metric-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
    }

    .card-cyan::before { background: linear-gradient(90deg, #0ea5e9, #38bdf8); }
    .card-emerald::before { background: linear-gradient(90deg, #10b981, #34d399); }
    .card-indigo::before { background: linear-gradient(90deg, #6366f1, #a855f7); }
    .card-amber::before { background: linear-gradient(90deg, #f59e0b, #fbbf24); }

    .metric-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .metric-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .metric-icon {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      background: rgba(255, 255, 255, 0.04);
    }

    .metric-val {
      font-size: 32px;
      font-weight: 800;
      font-family: 'Plus Jakarta Sans', sans-serif;
      letter-spacing: -0.03em;
      line-height: 1.1;
      margin-bottom: 6px;
    }

    .metric-meta {
      font-size: 12px;
      color: var(--text-dim);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .metric-meta span.active-tag {
      color: var(--emerald);
      font-weight: 600;
    }

    .tabs-header {
      display: flex;
      align-items: center;
      gap: 6px;
      background: rgba(15, 23, 42, 0.7);
      padding: 6px;
      border-radius: var(--radius-md);
      border: 1px solid var(--border-color);
      margin-bottom: 24px;
      overflow-x: auto;
    }

    .tab-btn {
      padding: 9px 18px;
      border-radius: var(--radius-sm);
      font-size: 13px;
      font-weight: 600;
      color: var(--text-muted);
      background: transparent;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s ease;
      white-space: nowrap;
    }

    .tab-btn:hover {
      color: var(--text-main);
      background: rgba(255, 255, 255, 0.04);
    }

    .tab-btn.active {
      color: white;
      background: linear-gradient(135deg, rgba(14, 165, 233, 0.2), rgba(99, 102, 241, 0.2));
      border: 1px solid rgba(14, 165, 233, 0.4);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    }

    .tab-badge {
      background: rgba(255, 255, 255, 0.1);
      padding: 2px 7px;
      border-radius: 9999px;
      font-size: 11px;
    }

    .tab-btn.active .tab-badge {
      background: var(--primary);
      color: white;
    }

    .tab-panel {
      display: none;
      animation: fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .tab-panel.active {
      display: block;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .action-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 14px;
      margin-bottom: 20px;
    }

    .search-filter-group {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      flex: 1;
      max-width: 700px;
    }

    .search-input-wrap {
      position: relative;
      flex: 1;
      min-width: 220px;
    }

    .search-input-wrap input {
      width: 100%;
      background: rgba(30, 41, 59, 0.6);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-sm);
      padding: 9px 14px 9px 38px;
      color: var(--text-main);
      font-size: 13px;
      outline: none;
      transition: all 0.2s ease;
    }

    .search-input-wrap input:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.15);
      background: rgba(30, 41, 59, 0.9);
    }

    .search-icon {
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 14px;
      color: var(--text-dim);
    }

    .filter-select {
      background: rgba(30, 41, 59, 0.6);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-sm);
      padding: 9px 14px;
      color: var(--text-main);
      font-size: 13px;
      outline: none;
      cursor: pointer;
    }

    .filter-select:focus {
      border-color: var(--primary);
    }

    .items-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
      gap: 20px;
    }

    .item-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      padding: 22px;
      box-shadow: var(--shadow-glass);
      transition: all 0.25s ease;
      display: flex;
      flex-direction: column;
      position: relative;
    }

    .item-card:hover {
      background: var(--bg-card-hover);
      border-color: rgba(255, 255, 255, 0.14);
      transform: translateY(-2px);
    }

    .item-card.inactive-item {
      opacity: 0.65;
      border-style: dashed;
    }

    .card-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 12px;
    }

    .card-heading {
      font-size: 17px;
      font-weight: 700;
      color: var(--text-main);
      line-height: 1.3;
      margin-bottom: 4px;
    }

    .status-pill {
      font-size: 11px;
      font-weight: 700;
      padding: 3px 10px;
      border-radius: 9999px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      white-space: nowrap;
    }

    .status-active {
      background: rgba(16, 185, 129, 0.15);
      color: var(--emerald);
      border: 1px solid rgba(16, 185, 129, 0.3);
    }

    .status-inactive {
      background: rgba(239, 68, 68, 0.15);
      color: var(--rose);
      border: 1px solid rgba(239, 68, 68, 0.3);
    }

    .status-new {
      background: rgba(14, 165, 233, 0.15);
      color: var(--primary);
      border: 1px solid rgba(14, 165, 233, 0.3);
    }

    .status-contacted {
      background: rgba(245, 158, 11, 0.15);
      color: var(--amber);
      border: 1px solid rgba(245, 158, 11, 0.3);
    }

    .status-closed {
      background: rgba(148, 163, 184, 0.15);
      color: var(--text-muted);
      border: 1px solid rgba(148, 163, 184, 0.3);
    }

    .card-info-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: var(--text-muted);
      margin-bottom: 8px;
    }

    .tags-container {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 14px 0;
    }

    .tag-badge {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.08);
      padding: 3px 9px;
      border-radius: 6px;
      font-size: 11px;
      color: #cbd5e1;
    }

    .card-footer {
      margin-top: auto;
      padding-top: 16px;
      border-top: 1px solid var(--border-color);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .card-controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .switch-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: var(--text-muted);
      cursor: pointer;
    }

    .switch {
      position: relative;
      display: inline-block;
      width: 36px;
      height: 20px;
    }

    .switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }

    .slider {
      position: absolute;
      cursor: pointer;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: #334155;
      transition: .3s cubic-bezier(0.16, 1, 0.3, 1);
      border-radius: 20px;
    }

    .slider:before {
      position: absolute;
      content: "";
      height: 14px;
      width: 14px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      transition: .3s cubic-bezier(0.16, 1, 0.3, 1);
      border-radius: 50%;
    }

    input:checked + .slider {
      background-color: var(--emerald);
      box-shadow: 0 0 10px var(--emerald-glow);
    }

    input:checked + .slider:before {
      transform: translateX(16px);
    }

    .table-container {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-glass);
      overflow-x: auto;
    }

    .usage-summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 14px;
      margin-bottom: 18px;
    }

    .usage-stat, .llm-call-details {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: 16px;
    }

    .usage-stat-label {
      color: var(--text-muted);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }

    .usage-stat-value {
      font-size: 26px;
      font-weight: 800;
      margin-top: 4px;
    }

    .llm-call-details {
      min-width: 280px;
      max-width: 620px;
      max-height: 460px;
      overflow: auto;
      margin-top: 8px;
      white-space: normal;
    }

    .llm-call-details h4 {
      margin: 12px 0 5px;
      color: var(--text-muted);
      font-size: 11px;
      text-transform: uppercase;
    }

    .llm-call-details pre {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      color: #cbd5e1;
      font: 12px/1.5 'JetBrains Mono', monospace;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 13px;
    }

    th {
      background: rgba(15, 23, 42, 0.85);
      color: var(--text-muted);
      font-weight: 600;
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.05em;
      padding: 14px 18px;
      border-bottom: 1px solid var(--border-color);
    }

    td {
      padding: 16px 18px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      color: var(--text-main);
      vertical-align: middle;
    }

    tr:last-child td {
      border-bottom: none;
    }

    tr:hover td {
      background: rgba(255, 255, 255, 0.02);
    }

    .mono-id {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: var(--text-dim);
    }

    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(10px);
      z-index: 1000;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .modal-overlay.active {
      display: flex;
      animation: modalFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes modalFadeIn {
      from { opacity: 0; transform: scale(0.96); }
      to { opacity: 1; transform: scale(1); }
    }

    .modal-box {
      background: #0f172a;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: var(--radius-xl);
      width: 100%;
      max-width: 600px;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8);
      padding: 28px;
      position: relative;
    }

    .modal-box-large {
      max-width: 820px;
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border-color);
    }

    .modal-title {
      font-size: 18px;
      font-weight: 700;
      font-family: 'Plus Jakarta Sans', sans-serif;
    }

    .modal-close {
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 20px;
      cursor: pointer;
      padding: 4px;
      line-height: 1;
    }

    .modal-close:hover {
      color: white;
    }

    .form-group {
      margin-bottom: 18px;
    }

    .form-label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .form-input, .form-textarea, .form-select {
      width: 100%;
      background: rgba(30, 41, 59, 0.7);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-sm);
      padding: 10px 14px;
      color: var(--text-main);
      font-size: 13px;
      outline: none;
      transition: border-color 0.2s ease;
      font-family: inherit;
    }

    .form-input:focus, .form-textarea:focus, .form-select:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.15);
      background: rgba(30, 41, 59, 0.95);
    }

    .form-hint {
      font-size: 11px;
      color: var(--text-dim);
      margin-top: 5px;
    }

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      margin-top: 24px;
      padding-top: 18px;
      border-top: 1px solid var(--border-color);
    }

    .sandbox-container {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
    }

    @media (max-width: 1024px) {
      .sandbox-container {
        grid-template-columns: 1fr;
      }
    }

    .sandbox-panel {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      padding: 24px;
      box-shadow: var(--shadow-glass);
      display: flex;
      flex-direction: column;
    }

    .code-block {
      background: #090d16;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: var(--radius-md);
      padding: 16px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: #93c5fd;
      line-height: 1.6;
      overflow-y: auto;
      max-height: 480px;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .test-chat-box {
      background: #090d16;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: var(--radius-md);
      padding: 18px;
      min-height: 280px;
      max-height: 380px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 14px;
      margin-bottom: 14px;
    }

    .chat-bubble {
      max-width: 82%;
      padding: 12px 16px;
      border-radius: var(--radius-md);
      font-size: 13px;
      line-height: 1.5;
    }

    .chat-user {
      align-self: flex-end;
      background: linear-gradient(135deg, #0ea5e9, #0284c7);
      color: white;
      border-bottom-right-radius: 4px;
    }

    .chat-agent {
      align-self: flex-start;
      background: rgba(30, 41, 59, 0.9);
      border: 1px solid var(--border-color);
      color: var(--text-main);
      border-bottom-left-radius: 4px;
    }

    .chat-agent-intent {
      font-size: 11px;
      font-weight: 600;
      color: var(--emerald);
      margin-top: 6px;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .toast-container {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2000;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .toast {
      background: #0f172a;
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: 14px 20px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 13px;
      min-width: 320px;
      transform: translateY(20px);
      opacity: 0;
      animation: toastIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    @keyframes toastIn {
      to { transform: translateY(0); opacity: 1; }
    }

    .toast.toast-success {
      border-color: rgba(16, 185, 129, 0.4);
      background: linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(15, 23, 42, 0.95));
    }

    .toast.toast-error {
      border-color: rgba(239, 68, 68, 0.4);
      background: linear-gradient(135deg, rgba(239, 68, 68, 0.12), rgba(15, 23, 42, 0.95));
    }

    .empty-state {
      padding: 48px 24px;
      text-align: center;
      color: var(--text-dim);
    }
    .empty-state-icon {
      font-size: 38px;
      margin-bottom: 12px;
      opacity: 0.6;
    }

    @media (max-width: 768px) {
      .navbar { padding: 12px 16px; }
      .dashboard-container { padding: 16px; }
      .brand-sub { display: none; }
      .items-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>

  <!-- Top Navbar -->
  <header class="navbar">
    <div class="brand-section">
      <div class="logo-container">🦷</div>
      <div>
        <div class="brand-title">
          Dr. Papi Dental AI
          <span class="brand-badge">Admin Hub</span>
        </div>
        <div class="brand-sub">Real-Time Knowledge & Operations Management</div>
      </div>
    </div>

    <div class="nav-actions">
      <div class="live-sync-indicator" title="Any changes you make here are instantly queried by the LLM on every incoming WhatsApp & Voice interaction.">
        <div class="pulse-dot"></div>
        <span>Agent Live Sync Active</span>
      </div>
      <a href="/playground" target="_blank" class="btn btn-secondary btn-sm" title="Open Interactive Voice Agent Playground">
        🎙️ Voice Playground
      </a>
      <a href="/api/docs" target="_blank" class="btn btn-secondary btn-sm" title="View OpenAPI Specification">
        📖 API Docs
      </a>
      <button class="btn btn-primary btn-sm" onclick="refreshCurrentTab()" title="Reload data">
        🔄 Refresh
      </button>
    </div>
  </header>

  <!-- Main Container -->
  <main class="dashboard-container">

    <!-- KPI Metric Cards -->
    <section class="metrics-grid">
      <div class="metric-card card-cyan" onclick="switchTab('clinics')" style="cursor: pointer;">
        <div class="metric-header">
          <span class="metric-title">Clinics Network</span>
          <div class="metric-icon">🏥</div>
        </div>
        <div class="metric-val" id="metric-clinics-total">--</div>
        <div class="metric-meta">
          <span class="active-tag" id="metric-clinics-active">-- active</span> in live bot
        </div>
      </div>

      <div class="metric-card card-emerald" onclick="switchTab('insurance')" style="cursor: pointer;">
        <div class="metric-header">
          <span class="metric-title">Insurance Plans</span>
          <div class="metric-icon">🛡️</div>
        </div>
        <div class="metric-val" id="metric-plans-total">--</div>
        <div class="metric-meta">
          <span class="active-tag" id="metric-plans-active">-- active</span> plans presented
        </div>
      </div>

      <div class="metric-card card-amber" onclick="switchTab('leads')" style="cursor: pointer;">
        <div class="metric-header">
          <span class="metric-title">Triage Leads</span>
          <div class="metric-icon">🎯</div>
        </div>
        <div class="metric-val" id="metric-leads-total">--</div>
        <div class="metric-meta">
          <span class="active-tag" id="metric-leads-new" style="color: var(--amber);">-- new</span> awaiting contact
        </div>
      </div>

      <div class="metric-card card-indigo" onclick="switchTab('appointments')" style="cursor: pointer;">
        <div class="metric-header">
          <span class="metric-title">Appointments</span>
          <div class="metric-icon">📅</div>
        </div>
        <div class="metric-val" id="metric-appts-total">--</div>
        <div class="metric-meta">
          <span class="active-tag" id="metric-appts-booked">-- booked</span> via AI / manual
        </div>
      </div>
    </section>

    <!-- Navigation Tabs -->
    <nav class="tabs-header">
      <button class="tab-btn active" id="tab-btn-clinics" onclick="switchTab('clinics')">
        🏥 Clinics <span class="tab-badge" id="badge-clinics">0</span>
      </button>
      <button class="tab-btn" id="tab-btn-insurance" onclick="switchTab('insurance')">
        🛡️ Insurance Plans <span class="tab-badge" id="badge-plans">0</span>
      </button>
      <button class="tab-btn" id="tab-btn-leads" onclick="switchTab('leads')">
        🎯 Patient Leads <span class="tab-badge" id="badge-leads">0</span>
      </button>
      <button class="tab-btn" id="tab-btn-appointments" onclick="switchTab('appointments')">
        📅 Appointments <span class="tab-badge" id="badge-appts">0</span>
      </button>
      <button class="tab-btn" id="tab-btn-users" onclick="switchTab('users')">
        💬 Patient Users & Logs <span class="tab-badge" id="badge-users">0</span>
      </button>
      <button class="tab-btn" id="tab-btn-llm-usage" onclick="switchTab('llm-usage')">
        🧠 LLM Usage <span class="tab-badge" id="badge-llm-usage">0</span>
      </button>
      <button class="tab-btn" id="tab-btn-sandbox" onclick="switchTab('sandbox')">
        ⚡ Live Agent Grounding & Test Sandbox
      </button>
    </nav>

    <!-- TAB 1: Clinics Management -->
    <section class="tab-panel active" id="panel-clinics">
      <div class="action-bar">
        <div class="search-filter-group">
          <div class="search-input-wrap">
            <span class="search-icon">🔍</span>
            <input type="text" id="clinics-search" placeholder="Search clinics by name, city, or service..." oninput="filterClinics()">
          </div>
          <select id="clinics-status-filter" class="filter-select" onchange="filterClinics()">
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE" selected>Active in Bot (Live)</option>
            <option value="INACTIVE">Deactivated</option>
          </select>
        </div>
        <button class="btn btn-primary" onclick="openAddClinicModal()">
          ➕ Add New Clinic
        </button>
      </div>

      <div class="items-grid" id="clinics-grid"></div>
    </section>

    <!-- TAB 2: Insurance Plans -->
    <section class="tab-panel" id="panel-insurance">
      <div class="action-bar">
        <div class="search-filter-group">
          <div class="search-input-wrap">
            <span class="search-icon">🔍</span>
            <input type="text" id="insurance-search" placeholder="Search plans by name or coverage perks..." oninput="filterInsurance()">
          </div>
          <select id="insurance-status-filter" class="filter-select" onchange="filterInsurance()">
            <option value="ALL">All Plans</option>
            <option value="ACTIVE" selected>Active in Bot (Live)</option>
            <option value="INACTIVE">Deactivated</option>
          </select>
        </div>
        <button class="btn btn-primary" onclick="openAddInsuranceModal()">
          ➕ Add Insurance Plan
        </button>
      </div>

      <div class="items-grid" id="insurance-grid"></div>
    </section>

    <!-- TAB 3: Leads Pipeline -->
    <section class="tab-panel" id="panel-leads">
      <div class="action-bar">
        <div class="search-filter-group">
          <div class="search-input-wrap">
            <span class="search-icon">🔍</span>
            <input type="text" id="leads-search" placeholder="Search leads by phone, user name, notes..." oninput="filterLeads()">
          </div>
          <select id="leads-status-filter" class="filter-select" onchange="loadLeads()">
            <option value="ALL">All Leads</option>
            <option value="NEW" selected>NEW Only</option>
            <option value="CONTACTED">CONTACTED</option>
            <option value="CLOSED">CLOSED</option>
          </select>
        </div>
      </div>

      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Patient / WhatsApp ID</th>
              <th>Intent Type</th>
              <th>Status</th>
              <th>Notes & Intake</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="leads-table-body"></tbody>
        </table>
      </div>
    </section>

    <!-- TAB 4: Appointments -->
    <section class="tab-panel" id="panel-appointments">
      <div class="action-bar">
        <div class="search-filter-group">
          <div class="search-input-wrap">
            <span class="search-icon">🔍</span>
            <input type="text" id="appts-search" placeholder="Search appointments by patient name, phone, service..." oninput="filterAppointments()">
          </div>
          <select id="appts-status-filter" class="filter-select" onchange="loadAppointments()">
            <option value="ALL">All Appointments</option>
            <option value="BOOKED" selected>BOOKED</option>
            <option value="CONFIRMED">CONFIRMED</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
        </div>
      </div>

      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Patient</th>
              <th>Phone</th>
              <th>Clinic Location</th>
              <th>Service</th>
              <th>Scheduled Time</th>
              <th>Status</th>
              <th>Channel</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="appts-table-body"></tbody>
        </table>
      </div>
    </section>

    <!-- TAB 5: Patient Users & Chat Logs -->
    <section class="tab-panel" id="panel-users">
      <div class="action-bar">
        <div class="search-input-wrap" style="max-width: 400px;">
          <span class="search-icon">🔍</span>
          <input type="text" id="users-search" placeholder="Search patients by phone, WhatsApp ID, or name..." oninput="filterUsers()">
        </div>
      </div>

      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Patient Name</th>
              <th>Phone Number</th>
              <th>WhatsApp ID</th>
              <th>Messages Sent</th>
              <th>Leads Generated</th>
              <th>Appointments</th>
              <th>First Interaction</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="users-table-body"></tbody>
        </table>
      </div>
    </section>

    <!-- TAB 6: LLM Usage & Prompt History -->
    <section class="tab-panel" id="panel-llm-usage">
      <div class="action-bar">
        <div>
          <div class="card-heading">LLM calls and prompt history</div>
          <p style="font-size: 12px; color: var(--text-muted);">
            Recent 100 calls, including failed attempts. Full prompts can contain patient-identifying or health information.
            Cost is not shown because provider billing metadata is not currently available.
          </p>
        </div>
        <button class="btn btn-secondary" onclick="loadLlmUsage()">🔄 Refresh usage</button>
      </div>

      <div class="usage-summary">
        <div class="usage-stat">
          <div class="usage-stat-label">Total calls</div>
          <div class="usage-stat-value" id="llm-total-calls">--</div>
        </div>
        <div class="usage-stat">
          <div class="usage-stat-label">Successful</div>
          <div class="usage-stat-value" id="llm-successful-calls" style="color: var(--emerald);">--</div>
        </div>
        <div class="usage-stat">
          <div class="usage-stat-label">Failed</div>
          <div class="usage-stat-value" id="llm-failed-calls" style="color: var(--rose);">--</div>
        </div>
      </div>

      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Workflow</th>
              <th>Provider / Model</th>
              <th>Status</th>
              <th>Duration</th>
              <th>Prompt details</th>
            </tr>
          </thead>
          <tbody id="llm-usage-table-body"></tbody>
        </table>
      </div>
    </section>

    <!-- TAB 7: Real-Time Grounding & Test Sandbox -->
    <section class="tab-panel" id="panel-sandbox">
      <div class="sandbox-container">
        <!-- Live Grounded System Prompt -->
        <div class="sandbox-panel">
          <div class="card-top">
            <div>
              <div class="card-heading">⚡ Live Assembled System Prompt</div>
              <p style="font-size: 12px; color: var(--text-muted);">
                This is the exact instruction set and verified database context injected into Gemini/OpenAI right now. Whenever you edit or activate a clinic/plan above, this updates in real time!
              </p>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="loadPromptPreview()">🔄 Re-fetch</button>
          </div>

          <div style="display: flex; gap: 10px; margin: 12px 0;">
            <div class="status-pill status-active" id="grounding-clinics-badge">🏥 -- Clinics Active</div>
            <div class="status-pill status-active" id="grounding-plans-badge">🛡️ -- Plans Active</div>
          </div>

          <pre class="code-block" id="prompt-preview-block">Loading live system prompt from agent engine...</pre>
        </div>

        <!-- Live Agent Test Console -->
        <div class="sandbox-panel">
          <div class="card-top">
            <div>
              <div class="card-heading">🧪 Real-Time Agent Test Sandbox</div>
              <p style="font-size: 12px; color: var(--text-muted);">
                Test how the agent responds using your newly edited clinics, insurance plans, and fees without sending a message on WhatsApp.
              </p>
            </div>
          </div>

          <div class="test-chat-box" id="test-chat-box">
            <div class="chat-bubble chat-agent">
              👋 <strong>Dr. Papi Dental AI Assistant:</strong>
              <div>Hello! I am grounded in your live clinic and insurance database. Try asking me about your clinic locations, operating hours, prices, or services!</div>
            </div>
          </div>

          <form id="test-agent-form" onsubmit="sendTestMessage(event)" style="display: flex; gap: 10px;">
            <input type="text" id="test-input" class="form-input" placeholder="e.g. Which clinic should I go to for a root canal in Nairobi?" required>
            <button type="submit" class="btn btn-primary" id="test-submit-btn">Send</button>
          </form>
          <div style="font-size: 11px; color: var(--text-dim); margin-top: 8px;">
            💡 Tip: Add or edit a clinic or insurance plan, then ask here immediately to verify real-time reactivity!
          </div>
        </div>
      </div>
    </section>

  </main>

  <!-- MODAL: Add/Edit Clinic -->
  <div class="modal-overlay" id="modal-clinic">
    <div class="modal-box">
      <div class="modal-header">
        <div class="modal-title" id="clinic-modal-title">Add New Dental Clinic</div>
        <button class="modal-close" onclick="closeModal('modal-clinic')">&times;</button>
      </div>
      <form id="clinic-form" onsubmit="saveClinic(event)">
        <input type="hidden" id="clinic-id">
        <div class="form-group">
          <label class="form-label">Clinic Name *</label>
          <input type="text" id="clinic-name" class="form-input" placeholder="e.g. BrightSmile Dental - Westlands" required>
        </div>
        <div class="form-group">
          <label class="form-label">Physical Address *</label>
          <input type="text" id="clinic-address" class="form-input" placeholder="e.g. 45 Ring Road, Floor 2" required>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
          <div class="form-group">
            <label class="form-label">City / Region *</label>
            <input type="text" id="clinic-city" class="form-input" placeholder="e.g. Nairobi or Mombasa" required>
          </div>
          <div class="form-group">
            <label class="form-label">Phone Number *</label>
            <input type="text" id="clinic-phone" class="form-input" placeholder="e.g. +254700333444" required>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Services Offered (comma-separated) *</label>
          <textarea id="clinic-services" class="form-textarea" rows="3" placeholder="General Checkup, Teeth Cleaning, Root Canal, Orthodontics, Dental Implants, Emergency Care" required></textarea>
          <div class="form-hint">The AI bot uses these exact services to match patient queries and guide bookings.</div>
        </div>
        <div class="form-group">
          <label class="switch-label">
            <div class="switch">
              <input type="checkbox" id="clinic-active" checked>
              <span class="slider"></span>
            </div>
            <span><strong>Active in AI Agent</strong> (Instantly grounded in bot answers)</span>
          </label>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="closeModal('modal-clinic')">Cancel</button>
          <button type="submit" class="btn btn-emerald" id="clinic-save-btn">Save Clinic</button>
        </div>
      </form>
    </div>
  </div>

  <!-- MODAL: Add/Edit Insurance Plan -->
  <div class="modal-overlay" id="modal-insurance">
    <div class="modal-box">
      <div class="modal-header">
        <div class="modal-title" id="insurance-modal-title">Add Insurance Plan</div>
        <button class="modal-close" onclick="closeModal('modal-insurance')">&times;</button>
      </div>
      <form id="insurance-form" onsubmit="saveInsurance(event)">
        <input type="hidden" id="insurance-id">
        <div class="form-group">
          <label class="form-label">Plan Name *</label>
          <input type="text" id="insurance-name" class="form-input" placeholder="e.g. BrightSmile Family Plus" required>
        </div>
        <div class="form-group">
          <label class="form-label">Monthly Cost (KES) *</label>
          <input type="number" step="0.01" min="0" id="insurance-cost" class="form-input" placeholder="e.g. 35.00" required>
        </div>
        <div class="form-group">
          <label class="form-label">Coverage Perks (comma-separated) *</label>
          <textarea id="insurance-perks" class="form-textarea" rows="3" placeholder="4 free cleanings per year, 40% off orthodontics, Emergency visit coverage" required></textarea>
          <div class="form-hint">Separate each perk with a comma. The bot pitches these perks when patients ask about insurance.</div>
        </div>
        <div class="form-group">
          <label class="form-label">Signup / Info URL *</label>
          <input type="url" id="insurance-url" class="form-input" placeholder="https://brightsmile.example.com/insurance/family-plus" required>
        </div>
        <div class="form-group">
          <label class="switch-label">
            <div class="switch">
              <input type="checkbox" id="insurance-active" checked>
              <span class="slider"></span>
            </div>
            <span><strong>Active in AI Agent</strong> (Bot will promote this plan)</span>
          </label>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="closeModal('modal-insurance')">Cancel</button>
          <button type="submit" class="btn btn-emerald" id="insurance-save-btn">Save Plan</button>
        </div>
      </form>
    </div>
  </div>

  <!-- MODAL: Update Lead Details -->
  <div class="modal-overlay" id="modal-lead">
    <div class="modal-box">
      <div class="modal-header">
        <div class="modal-title">Update Lead Status & Notes</div>
        <button class="modal-close" onclick="closeModal('modal-lead')">&times;</button>
      </div>
      <form id="lead-form" onsubmit="saveLead(event)">
        <input type="hidden" id="lead-id">
        <div class="form-group">
          <label class="form-label">Patient Details</label>
          <div id="lead-patient-summary" style="padding: 10px; background: rgba(255,255,255,0.03); border-radius: 8px; font-size: 13px;"></div>
        </div>
        <div class="form-group">
          <label class="form-label">Lead Status *</label>
          <select id="lead-status" class="form-select">
            <option value="NEW">NEW</option>
            <option value="CONTACTED">CONTACTED</option>
            <option value="CLOSED">CLOSED</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Staff Notes / Follow-up Details</label>
          <textarea id="lead-notes" class="form-textarea" rows="4" placeholder="Enter follow-up outcome, patient requests, or booking references..."></textarea>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="closeModal('modal-lead')">Cancel</button>
          <button type="submit" class="btn btn-primary">Update Lead</button>
        </div>
      </form>
    </div>
  </div>

  <!-- MODAL: Update Appointment -->
  <div class="modal-overlay" id="modal-appt">
    <div class="modal-box">
      <div class="modal-header">
        <div class="modal-title">Update Appointment</div>
        <button class="modal-close" onclick="closeModal('modal-appt')">&times;</button>
      </div>
      <form id="appt-form" onsubmit="saveAppointment(event)">
        <input type="hidden" id="appt-id">
        <div class="form-group">
          <label class="form-label">Patient & Booking Summary</label>
          <div id="appt-summary" style="padding: 10px; background: rgba(255,255,255,0.03); border-radius: 8px; font-size: 13px;"></div>
        </div>
        <div class="form-group">
          <label class="form-label">Appointment Status *</label>
          <select id="appt-status" class="form-select">
            <option value="BOOKED">BOOKED</option>
            <option value="CONFIRMED">CONFIRMED</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Staff / Clinical Notes</label>
          <textarea id="appt-notes" class="form-textarea" rows="3" placeholder="e.g. Patient prefers morning slot, requested Dr. Papi"></textarea>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="closeModal('modal-appt')">Cancel</button>
          <button type="submit" class="btn btn-primary">Update Appointment</button>
        </div>
      </form>
    </div>
  </div>

  <!-- MODAL: View Conversation Logs -->
  <div class="modal-overlay" id="modal-conversation">
    <div class="modal-box modal-box-large">
      <div class="modal-header">
        <div>
          <div class="modal-title" id="conv-modal-title">Patient Conversation Log</div>
          <div id="conv-modal-sub" style="font-size: 12px; color: var(--text-muted);"></div>
        </div>
        <button class="modal-close" onclick="closeModal('modal-conversation')">&times;</button>
      </div>
      <div class="test-chat-box" id="conv-messages-container" style="max-height: 500px; min-height: 350px;"></div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="closeModal('modal-conversation')">Close</button>
      </div>
    </div>
  </div>

  <div class="toast-container" id="toast-container"></div>

  <script>
    var allClinics = [];
    var allInsurance = [];
    var allLeads = [];
    var allAppointments = [];
    var allUsers = [];
    var allLlmCalls = [];
    var currentTab = 'clinics';

    document.addEventListener('DOMContentLoaded', function() {
      loadStats();
      loadClinics();
      loadInsurance();
      loadLeads();
      loadAppointments();
      loadUsers();
      loadLlmUsage();
      loadPromptPreview();
    });

    function showToast(message, type) {
      if (!type) type = 'success';
      var container = document.getElementById('toast-container');
      var toast = document.createElement('div');
      toast.className = 'toast toast-' + type;
      toast.innerHTML = (type === 'success' ? '✅' : '⚠️') + ' <span>' + message + '</span>';
      container.appendChild(toast);
      setTimeout(function() {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(function() { toast.remove(); }, 300);
      }, 4000);
    }

    function switchTab(tabName) {
      currentTab = tabName;
      document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
      document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });

      var btn = document.getElementById('tab-btn-' + tabName);
      var panel = document.getElementById('panel-' + tabName);
      if (btn) btn.classList.add('active');
      if (panel) panel.classList.add('active');

      if (tabName === 'sandbox') {
        loadPromptPreview();
      }
      if (tabName === 'llm-usage') {
        loadLlmUsage();
      }
    }

    function refreshCurrentTab() {
      loadStats();
      if (currentTab === 'clinics') loadClinics();
      else if (currentTab === 'insurance') loadInsurance();
      else if (currentTab === 'leads') loadLeads();
      else if (currentTab === 'appointments') loadAppointments();
      else if (currentTab === 'users') loadUsers();
      else if (currentTab === 'llm-usage') loadLlmUsage();
      else if (currentTab === 'sandbox') loadPromptPreview();
      showToast('Dashboard synchronized with live database.');
    }

    function openModal(id) {
      document.getElementById(id).classList.add('active');
    }
    function closeModal(id) {
      document.getElementById(id).classList.remove('active');
    }

    // STATS OVERVIEW
    async function loadStats() {
      try {
        var res = await fetch('/admin/stats');
        if (!res.ok) return;
        var stats = await res.json();

        document.getElementById('metric-clinics-total').innerText = stats.clinics.total;
        document.getElementById('metric-clinics-active').innerText = stats.clinics.active + ' active';
        document.getElementById('badge-clinics').innerText = stats.clinics.total;

        document.getElementById('metric-plans-total').innerText = stats.insurancePlans.total;
        document.getElementById('metric-plans-active').innerText = stats.insurancePlans.active + ' active';
        document.getElementById('badge-plans').innerText = stats.insurancePlans.total;

        document.getElementById('metric-leads-total').innerText = stats.leads.total;
        document.getElementById('metric-leads-new').innerText = stats.leads.new + ' new';
        document.getElementById('badge-leads').innerText = stats.leads.new;

        document.getElementById('metric-appts-total').innerText = stats.appointments.total;
        document.getElementById('metric-appts-booked').innerText = stats.appointments.booked + ' booked';
        document.getElementById('badge-appts').innerText = stats.appointments.total;

        document.getElementById('badge-users').innerText = stats.users.total;
      } catch (err) {
        console.error('Error loading stats:', err);
      }
    }

    // CLINICS
    async function loadClinics() {
      try {
        var res = await fetch('/admin/clinics?includeInactive=true');
        allClinics = await res.json();
        renderClinics(allClinics);
      } catch (err) {
        console.error('Error fetching clinics:', err);
      }
    }

    function filterClinics() {
      var q = (document.getElementById('clinics-search').value || '').toLowerCase();
      var statusFilter = document.getElementById('clinics-status-filter').value;

      var filtered = allClinics.filter(function(c) {
        var matchesQuery = c.name.toLowerCase().includes(q) ||
          c.city.toLowerCase().includes(q) ||
          c.address.toLowerCase().includes(q) ||
          c.services.some(function(s) { return s.toLowerCase().includes(q); });

        if (!matchesQuery) return false;
        if (statusFilter === 'ACTIVE') return c.isActive === true;
        if (statusFilter === 'INACTIVE') return c.isActive === false;
        return true;
      });

      renderClinics(filtered);
    }

    function renderClinics(clinics) {
      var grid = document.getElementById('clinics-grid');
      if (!clinics || clinics.length === 0) {
        grid.innerHTML = '<div class="empty-state" style="grid-column: 1/-1;"><div class="empty-state-icon">🏥</div><p>No clinics found matching criteria.</p></div>';
        return;
      }

      var html = '';
      clinics.forEach(function(c) {
        var inactiveCls = c.isActive ? '' : 'inactive-item';
        var statusCls = c.isActive ? 'status-active' : 'status-inactive';
        var statusText = c.isActive ? '● Live in Bot' : '○ Inactive';
        var checkedAttr = c.isActive ? 'checked' : '';
        var tags = c.services.map(function(s) { return '<span class="tag-badge">' + escapeHtml(s) + '</span>'; }).join('');

        html += '<div class="item-card ' + inactiveCls + '">' +
          '<div class="card-top">' +
            '<div>' +
              '<div class="card-heading">' + escapeHtml(c.name) + '</div>' +
              '<div class="card-info-row">' +
                '<span>📍 ' + escapeHtml(c.address) + ', <strong>' + escapeHtml(c.city) + '</strong></span>' +
              '</div>' +
            '</div>' +
            '<span class="status-pill ' + statusCls + '">' + statusText + '</span>' +
          '</div>' +
          '<div class="card-info-row"><span>📞 ' + escapeHtml(c.phone) + '</span></div>' +
          '<div style="margin-top: 8px;">' +
            '<div style="font-size: 11px; color: var(--text-dim); text-transform: uppercase; font-weight: 600;">Services:</div>' +
            '<div class="tags-container">' + tags + '</div>' +
          '</div>' +
          '<div class="card-footer">' +
            '<label class="switch-label">' +
              '<div class="switch">' +
                '<input type="checkbox" ' + checkedAttr + ' onchange="toggleClinicActive(\\'' + c.id + '\\', this.checked)">' +
                '<span class="slider"></span>' +
              '</div>' +
              '<span>Active</span>' +
            '</label>' +
            '<div class="card-controls">' +
              '<button class="btn btn-secondary btn-sm" onclick="openEditClinicModal(\\'' + c.id + '\\')">✏️ Edit</button>' +
              '<button class="btn btn-danger btn-sm" onclick="deleteClinic(\\'' + c.id + '\\')">🗑️</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      });

      grid.innerHTML = html;
    }

    function openAddClinicModal() {
      document.getElementById('clinic-modal-title').innerText = 'Add New Dental Clinic';
      document.getElementById('clinic-form').reset();
      document.getElementById('clinic-id').value = '';
      document.getElementById('clinic-active').checked = true;
      openModal('modal-clinic');
    }

    function openEditClinicModal(id) {
      var clinic = allClinics.find(function(c) { return c.id === id; });
      if (!clinic) return;

      document.getElementById('clinic-modal-title').innerText = 'Edit Dental Clinic';
      document.getElementById('clinic-id').value = clinic.id;
      document.getElementById('clinic-name').value = clinic.name;
      document.getElementById('clinic-address').value = clinic.address;
      document.getElementById('clinic-city').value = clinic.city;
      document.getElementById('clinic-phone').value = clinic.phone;
      document.getElementById('clinic-services').value = clinic.services.join(', ');
      document.getElementById('clinic-active').checked = clinic.isActive;
      openModal('modal-clinic');
    }

    async function saveClinic(e) {
      e.preventDefault();
      var id = document.getElementById('clinic-id').value;
      var servicesRaw = document.getElementById('clinic-services').value;
      var services = servicesRaw.split(',').map(function(s) { return s.trim(); }).filter(Boolean);

      var payload = {
        name: document.getElementById('clinic-name').value.trim(),
        address: document.getElementById('clinic-address').value.trim(),
        city: document.getElementById('clinic-city').value.trim(),
        phone: document.getElementById('clinic-phone').value.trim(),
        services: services,
        isActive: document.getElementById('clinic-active').checked,
      };

      try {
        var url = id ? '/admin/clinics/' + id : '/admin/clinics';
        var method = id ? 'PATCH' : 'POST';
        var res = await fetch(url, {
          method: method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          var errData = await res.json();
          throw new Error(errData.message || 'Failed to save clinic');
        }

        closeModal('modal-clinic');
        showToast(id ? 'Clinic updated! AI Agent prompt synchronized in real-time.' : 'New clinic created and immediately active in bot!');
        await loadClinics();
        await loadStats();
        loadPromptPreview();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    async function toggleClinicActive(id, isActive) {
      try {
        var res = await fetch('/admin/clinics/' + id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive: isActive }),
        });
        if (!res.ok) throw new Error('Failed to update clinic status');
        showToast(isActive ? 'Clinic activated in AI Agent context.' : 'Clinic deactivated from AI Agent.');
        await loadClinics();
        await loadStats();
        loadPromptPreview();
      } catch (err) {
        showToast(err.message, 'error');
        loadClinics();
      }
    }

    async function deleteClinic(id) {
      if (!confirm('Are you sure you want to deactivate/delete this clinic?')) return;
      try {
        var res = await fetch('/admin/clinics/' + id, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete clinic');
        showToast('Clinic deactivated successfully.');
        await loadClinics();
        await loadStats();
        loadPromptPreview();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    // INSURANCE PLANS
    async function loadInsurance() {
      try {
        var res = await fetch('/admin/insurance-plans?includeInactive=true');
        allInsurance = await res.json();
        renderInsurance(allInsurance);
      } catch (err) {
        console.error('Error fetching insurance plans:', err);
      }
    }

    function filterInsurance() {
      var q = (document.getElementById('insurance-search').value || '').toLowerCase();
      var statusFilter = document.getElementById('insurance-status-filter').value;

      var filtered = allInsurance.filter(function(p) {
        var matchesQuery = p.name.toLowerCase().includes(q) ||
          p.coveragePerks.some(function(perk) { return perk.toLowerCase().includes(q); });

        if (!matchesQuery) return false;
        if (statusFilter === 'ACTIVE') return p.isActive === true;
        if (statusFilter === 'INACTIVE') return p.isActive === false;
        return true;
      });

      renderInsurance(filtered);
    }

    function renderInsurance(plans) {
      var grid = document.getElementById('insurance-grid');
      if (!plans || plans.length === 0) {
        grid.innerHTML = '<div class="empty-state" style="grid-column: 1/-1;"><div class="empty-state-icon">🛡️</div><p>No insurance plans found.</p></div>';
        return;
      }

      var html = '';
      plans.forEach(function(p) {
        var inactiveCls = p.isActive ? '' : 'inactive-item';
        var statusCls = p.isActive ? 'status-active' : 'status-inactive';
        var statusText = p.isActive ? '● Live in Bot' : '○ Inactive';
        var checkedAttr = p.isActive ? 'checked' : '';
        var perksList = p.coveragePerks.map(function(perk) { return '<li style="margin-bottom: 3px;">' + escapeHtml(perk) + '</li>'; }).join('');

        html += '<div class="item-card ' + inactiveCls + '">' +
          '<div class="card-top">' +
            '<div>' +
              '<div class="card-heading">' + escapeHtml(p.name) + '</div>' +
              '<div style="font-size: 20px; font-weight: 800; color: var(--emerald); margin-top: 4px;">' +
                'KES ' + p.monthlyCost.toFixed(2) + ' <span style="font-size: 12px; color: var(--text-dim); font-weight: 500;">/ month</span>' +
              '</div>' +
            '</div>' +
            '<span class="status-pill ' + statusCls + '">' + statusText + '</span>' +
          '</div>' +
          '<div style="margin-top: 10px;">' +
            '<div style="font-size: 11px; color: var(--text-dim); text-transform: uppercase; font-weight: 600;">Coverage Perks:</div>' +
            '<ul style="margin: 6px 0 10px 18px; font-size: 12px; color: #cbd5e1;">' + perksList + '</ul>' +
          '</div>' +
          '<div style="font-size: 11px; color: var(--text-dim); margin-bottom: 12px; word-break: break-all;">' +
            '🔗 <a href="' + escapeHtml(p.signupUrl) + '" target="_blank" style="color: var(--primary); text-decoration: none;">' + escapeHtml(p.signupUrl) + '</a>' +
          '</div>' +
          '<div class="card-footer">' +
            '<label class="switch-label">' +
              '<div class="switch">' +
                '<input type="checkbox" ' + checkedAttr + ' onchange="toggleInsuranceActive(\\'' + p.id + '\\', this.checked)">' +
                '<span class="slider"></span>' +
              '</div>' +
              '<span>Active</span>' +
            '</label>' +
            '<div class="card-controls">' +
              '<button class="btn btn-secondary btn-sm" onclick="openEditInsuranceModal(\\'' + p.id + '\\')">✏️ Edit</button>' +
              '<button class="btn btn-danger btn-sm" onclick="deleteInsurance(\\'' + p.id + '\\')">🗑️</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      });

      grid.innerHTML = html;
    }

    function openAddInsuranceModal() {
      document.getElementById('insurance-modal-title').innerText = 'Add Insurance Plan';
      document.getElementById('insurance-form').reset();
      document.getElementById('insurance-id').value = '';
      document.getElementById('insurance-active').checked = true;
      openModal('modal-insurance');
    }

    function openEditInsuranceModal(id) {
      var plan = allInsurance.find(function(p) { return p.id === id; });
      if (!plan) return;

      document.getElementById('insurance-modal-title').innerText = 'Edit Insurance Plan';
      document.getElementById('insurance-id').value = plan.id;
      document.getElementById('insurance-name').value = plan.name;
      document.getElementById('insurance-cost').value = plan.monthlyCost;
      document.getElementById('insurance-perks').value = plan.coveragePerks.join(', ');
      document.getElementById('insurance-url').value = plan.signupUrl;
      document.getElementById('insurance-active').checked = plan.isActive;
      openModal('modal-insurance');
    }

    async function saveInsurance(e) {
      e.preventDefault();
      var id = document.getElementById('insurance-id').value;
      var perksRaw = document.getElementById('insurance-perks').value;
      var perks = perksRaw.split(',').map(function(s) { return s.trim(); }).filter(Boolean);

      var payload = {
        name: document.getElementById('insurance-name').value.trim(),
        monthlyCost: parseFloat(document.getElementById('insurance-cost').value),
        coveragePerks: perks,
        signupUrl: document.getElementById('insurance-url').value.trim(),
        isActive: document.getElementById('insurance-active').checked,
      };

      try {
        var url = id ? '/admin/insurance-plans/' + id : '/admin/insurance-plans';
        var method = id ? 'PATCH' : 'POST';
        var res = await fetch(url, {
          method: method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          var errData = await res.json();
          throw new Error(errData.message || 'Failed to save insurance plan');
        }

        closeModal('modal-insurance');
        showToast(id ? 'Insurance plan updated! Agent offers new pricing/perks immediately.' : 'New insurance plan activated in live agent!');
        await loadInsurance();
        await loadStats();
        loadPromptPreview();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    async function toggleInsuranceActive(id, isActive) {
      try {
        var res = await fetch('/admin/insurance-plans/' + id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive: isActive }),
        });
        if (!res.ok) throw new Error('Failed to update plan status');
        showToast(isActive ? 'Plan active in AI responses.' : 'Plan deactivated.');
        await loadInsurance();
        await loadStats();
        loadPromptPreview();
      } catch (err) {
        showToast(err.message, 'error');
        loadInsurance();
      }
    }

    async function deleteInsurance(id) {
      if (!confirm('Are you sure you want to deactivate/delete this insurance plan?')) return;
      try {
        var res = await fetch('/admin/insurance-plans/' + id, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete plan');
        showToast('Insurance plan deactivated.');
        await loadInsurance();
        await loadStats();
        loadPromptPreview();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    // LEADS
    async function loadLeads() {
      try {
        var status = document.getElementById('leads-status-filter').value;
        var url = status === 'ALL' ? '/admin/leads' : '/admin/leads?status=' + status;
        var res = await fetch(url);
        allLeads = await res.json();
        renderLeads(allLeads);
      } catch (err) {
        console.error('Error fetching leads:', err);
      }
    }

    function filterLeads() {
      var q = (document.getElementById('leads-search').value || '').toLowerCase();
      var filtered = allLeads.filter(function(l) {
        var patientName = l.user?.name || '';
        var phone = l.user?.phone || l.user?.whatsappId || '';
        var notes = l.notes || '';
        return patientName.toLowerCase().includes(q) ||
          phone.toLowerCase().includes(q) ||
          notes.toLowerCase().includes(q);
      });
      renderLeads(filtered);
    }

    function renderLeads(leads) {
      var tbody = document.getElementById('leads-table-body');
      if (!leads || leads.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><div class="empty-state-icon">🎯</div><p>No leads found in this view.</p></td></tr>';
        return;
      }

      var html = '';
      leads.forEach(function(l) {
        var statusClass = l.status === 'NEW' ? 'status-new' : l.status === 'CONTACTED' ? 'status-contacted' : 'status-closed';
        var dateStr = new Date(l.createdAt).toLocaleDateString('en-KE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        var uName = l.user?.name || 'WhatsApp Patient';
        var wId = l.user?.whatsappId || 'N/A';
        var phone = l.user?.phone || 'Not linked';

        html += '<tr>' +
          '<td>' +
            '<div style="font-weight: 600;">' + escapeHtml(uName) + '</div>' +
            '<div>' + escapeHtml(phone) + '</div>' +
            '<div class="mono-id">' + escapeHtml(wId) + '</div>' +
          '</td>' +
          '<td><span class="tag-badge" style="background: rgba(14, 165, 233, 0.1); color: var(--primary);">' + escapeHtml(l.type) + '</span></td>' +
          '<td><span class="status-pill ' + statusClass + '">' + l.status + '</span></td>' +
          '<td style="max-width: 280px; font-size: 12px; color: var(--text-muted);">' + escapeHtml(l.notes || 'No intake notes recorded.') + '</td>' +
          '<td style="font-size: 12px; color: var(--text-dim); white-space: nowrap;">' + dateStr + '</td>' +
          '<td>' +
            '<div style="display: flex; gap: 6px;">' +
              '<button class="btn btn-secondary btn-sm" onclick="openLeadModal(\\'' + l.id + '\\')">Manage</button>' +
              '<button class="btn btn-secondary btn-sm" onclick="viewUserChat(\\'' + l.userId + '\\', \\'' + escapeHtml(uName) + '\\')">💬 Chat</button>' +
            '</div>' +
          '</td>' +
        '</tr>';
      });

      tbody.innerHTML = html;
    }

    function openLeadModal(id) {
      var lead = allLeads.find(function(l) { return l.id === id; });
      if (!lead) return;

      document.getElementById('lead-id').value = lead.id;
      document.getElementById('lead-status').value = lead.status;
      document.getElementById('lead-notes').value = lead.notes || '';
      document.getElementById('lead-patient-summary').innerHTML =
        '<strong>Patient:</strong> ' + escapeHtml(lead.user?.name || 'Anonymous') + ' | ' +
        '<strong>Phone:</strong> ' + escapeHtml(lead.user?.phone || 'Not linked') + ' | ' +
        '<strong>WhatsApp ID:</strong> ' + escapeHtml(lead.user?.whatsappId || 'N/A') + ' | ' +
        '<strong>Type:</strong> ' + escapeHtml(lead.type);
      openModal('modal-lead');
    }

    async function saveLead(e) {
      e.preventDefault();
      var id = document.getElementById('lead-id').value;
      var status = document.getElementById('lead-status').value;
      var notes = document.getElementById('lead-notes').value.trim();

      try {
        var res = await fetch('/admin/leads/' + id + '/status', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: status, notes: notes }),
        });
        if (!res.ok) throw new Error('Failed to update lead');

        closeModal('modal-lead');
        showToast('Lead updated successfully!');
        await loadLeads();
        await loadStats();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    // APPOINTMENTS
    async function loadAppointments() {
      try {
        var status = document.getElementById('appts-status-filter').value;
        var url = status === 'ALL' ? '/api/v1/appointments' : '/api/v1/appointments?status=' + status;
        var res = await fetch(url);
        allAppointments = await res.json();
        renderAppointments(allAppointments);
      } catch (err) {
        console.error('Error fetching appointments:', err);
      }
    }

    function filterAppointments() {
      var q = (document.getElementById('appts-search').value || '').toLowerCase();
      var filtered = allAppointments.filter(function(a) {
        return (a.clientName || '').toLowerCase().includes(q) ||
          (a.phone || '').toLowerCase().includes(q) ||
          (a.service || '').toLowerCase().includes(q) ||
          (a.clinicName || '').toLowerCase().includes(q);
      });
      renderAppointments(filtered);
    }

    function renderAppointments(appts) {
      var tbody = document.getElementById('appts-table-body');
      if (!appts || appts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state"><div class="empty-state-icon">📅</div><p>No appointments found in this view.</p></td></tr>';
        return;
      }

      var html = '';
      appts.forEach(function(a) {
        var statusClass = a.status === 'CONFIRMED' ? 'status-active' :
          a.status === 'BOOKED' ? 'status-contacted' :
          a.status === 'COMPLETED' ? 'status-closed' : 'status-inactive';

        var scheduledDate = new Date(a.scheduledAt).toLocaleString('en-KE', {
          weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        html += '<tr>' +
          '<td style="font-weight: 600;">' + escapeHtml(a.clientName) + '</td>' +
          '<td>' + escapeHtml(a.phone) + '</td>' +
          '<td>' + escapeHtml(a.clinicName || 'Main Clinic') + '</td>' +
          '<td><span class="tag-badge">' + escapeHtml(a.service) + '</span></td>' +
          '<td style="font-size: 12px; font-weight: 500; color: #38bdf8;">' + scheduledDate + '</td>' +
          '<td><span class="status-pill ' + statusClass + '">' + a.status + '</span></td>' +
          '<td><span class="mono-id" style="color: var(--emerald);">' + escapeHtml(a.bookedVia) + '</span></td>' +
          '<td>' +
            '<div style="display: flex; gap: 4px;">' +
              '<button class="btn btn-secondary btn-sm" onclick="openApptModal(\\'' + a.id + '\\')">Manage</button>' +
            '</div>' +
          '</td>' +
        '</tr>';
      });

      tbody.innerHTML = html;
    }

    function openApptModal(id) {
      var appt = allAppointments.find(function(a) { return a.id === id; });
      if (!appt) return;

      document.getElementById('appt-id').value = appt.id;
      document.getElementById('appt-status').value = appt.status;
      document.getElementById('appt-notes').value = appt.notes || '';

      document.getElementById('appt-summary').innerHTML =
        '<strong>Client:</strong> ' + escapeHtml(appt.clientName) + ' (' + escapeHtml(appt.phone) + ')<br>' +
        '<strong>Service:</strong> ' + escapeHtml(appt.service) + ' | <strong>Location:</strong> ' + escapeHtml(appt.clinicName || 'Default');
      openModal('modal-appt');
    }

    async function saveAppointment(e) {
      e.preventDefault();
      var id = document.getElementById('appt-id').value;
      var status = document.getElementById('appt-status').value;

      try {
        var res = await fetch('/api/v1/appointments/' + id + '/status', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: status }),
        });
        if (!res.ok) throw new Error('Failed to update appointment status');

        closeModal('modal-appt');
        showToast('Appointment updated successfully!');
        await loadAppointments();
        await loadStats();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    // USERS & CONVERSATIONS
    async function loadUsers() {
      try {
        var res = await fetch('/admin/users');
        allUsers = await res.json();
        renderUsers(allUsers);
      } catch (err) {
        console.error('Error fetching users:', err);
      }
    }

    async function loadLlmUsage() {
      var tbody = document.getElementById('llm-usage-table-body');
      try {
        var res = await fetch('/admin/llm-usage');
        if (!res.ok) throw new Error('Failed to load LLM usage records');
        var usage = await res.json();
        allLlmCalls = usage.recentCalls || [];

        document.getElementById('llm-total-calls').innerText = usage.totalCalls;
        document.getElementById('llm-successful-calls').innerText = usage.successfulCalls;
        document.getElementById('llm-failed-calls').innerText = usage.failedCalls;
        document.getElementById('badge-llm-usage').innerText = usage.totalCalls;
        renderLlmUsage(allLlmCalls);
      } catch (err) {
        console.error('Error fetching LLM usage:', err);
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Unable to load LLM usage records.</td></tr>';
      }
    }

    function renderLlmUsage(calls) {
      var tbody = document.getElementById('llm-usage-table-body');
      if (!calls || calls.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><div class="empty-state-icon">🧠</div><p>No LLM calls recorded yet.</p></td></tr>';
        return;
      }

      tbody.innerHTML = calls.map(function(call) {
        var statusClass = call.status === 'SUCCESS' ? 'status-active' : 'status-inactive';
        var history;
        try {
          history = JSON.stringify(JSON.parse(call.history || '[]'), null, 2);
        } catch (_) {
          history = call.history || '[]';
        }
        var details = '<details><summary class="btn btn-secondary btn-sm">Inspect prompt</summary>' +
          '<div class="llm-call-details">' +
            '<h4>System prompt</h4><pre>' + escapeHtml(call.systemPrompt) + '</pre>' +
            '<h4>Conversation history</h4><pre>' + escapeHtml(history) + '</pre>' +
            '<h4>User prompt</h4><pre>' + escapeHtml(call.userPrompt) + '</pre>' +
            (call.response ? '<h4>Model response</h4><pre>' + escapeHtml(call.response) + '</pre>' : '') +
            (call.error ? '<h4>Error</h4><pre style="color: var(--rose);">' + escapeHtml(call.error) + '</pre>' : '') +
          '</div></details>';

        return '<tr>' +
          '<td style="white-space: nowrap;">' + escapeHtml(new Date(call.createdAt).toLocaleString()) + '</td>' +
          '<td>' + escapeHtml(call.operation) + '</td>' +
          '<td>' + escapeHtml(call.provider) + ' / ' + escapeHtml(call.model) + '</td>' +
          '<td><span class="status-pill ' + statusClass + '">' + escapeHtml(call.status) + '</span></td>' +
          '<td>' + escapeHtml(call.durationMs) + ' ms</td>' +
          '<td>' + details + '</td>' +
        '</tr>';
      }).join('');
    }

    function filterUsers() {
      var q = (document.getElementById('users-search').value || '').toLowerCase();
      var filtered = allUsers.filter(function(u) {
        return (u.whatsappId || '').toLowerCase().includes(q) ||
          (u.phone || '').toLowerCase().includes(q) ||
          (u.name || '').toLowerCase().includes(q);
      });
      renderUsers(filtered);
    }

    function renderUsers(users) {
      var tbody = document.getElementById('users-table-body');
      if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state"><div class="empty-state-icon">👥</div><p>No patient users registered yet.</p></td></tr>';
        return;
      }

      var html = '';
      users.forEach(function(u) {
        var dateStr = new Date(u.createdAt).toLocaleDateString('en-KE', { month: 'short', day: 'numeric', year: 'numeric' });
        var uName = u.name || 'Anonymous Patient';

        html += '<tr>' +
          '<td style="font-weight: 600;">' + escapeHtml(uName) + '</td>' +
          '<td class="mono-id">' + escapeHtml(u.phone || 'Not linked') + '</td>' +
          '<td class="mono-id">' + escapeHtml(u.whatsappId) + '</td>' +
          '<td><span class="tag-badge">' + (u._count?.messages || 0) + ' messages</span></td>' +
          '<td><span class="tag-badge" style="background: rgba(245, 158, 11, 0.1); color: var(--amber);">' + (u._count?.leads || 0) + ' leads</span></td>' +
          '<td><span class="tag-badge" style="background: rgba(99, 102, 241, 0.1); color: var(--indigo);">' + (u._count?.appointments || 0) + ' bookings</span></td>' +
          '<td style="font-size: 12px; color: var(--text-dim);">' + dateStr + '</td>' +
          '<td>' +
            '<button class="btn btn-secondary btn-sm" onclick="viewUserChat(\\'' + u.id + '\\', \\'' + escapeHtml(uName) + '\\')">💬 View Transcript</button>' +
          '</td>' +
        '</tr>';
      });

      tbody.innerHTML = html;
    }

    async function viewUserChat(userId, userName) {
      try {
        var res = await fetch('/admin/users/' + userId + '/conversation');
        if (!res.ok) throw new Error('Failed to load conversation history');
        var user = await res.json();

        document.getElementById('conv-modal-title').innerText = 'Conversation with ' + userName;
        document.getElementById('conv-modal-sub').innerText = 'Phone: ' + (user.phone || 'Not linked') + ' • WhatsApp ID: ' + user.whatsappId + ' • Total Messages: ' + (user.messages?.length || 0);

        var container = document.getElementById('conv-messages-container');
        if (!user.messages || user.messages.length === 0) {
          container.innerHTML = '<div class="empty-state"><p>No messages recorded for this user.</p></div>';
        } else {
          var html = '';
          user.messages.forEach(function(m) {
            var isUser = m.role.toLowerCase() === 'user';
            var time = new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            var bubbleCls = isUser ? 'chat-user' : 'chat-agent';
            var senderLabel = isUser ? '👤 Patient' : '🦷 Dental Assistant';

            html += '<div class="chat-bubble ' + bubbleCls + '">' +
              '<div style="font-size: 10px; opacity: 0.7; margin-bottom: 2px;">' + senderLabel + ' • ' + time + '</div>' +
              '<div>' + escapeHtml(m.content) + '</div>' +
            '</div>';
          });
          container.innerHTML = html;
        }

        openModal('modal-conversation');
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    // REAL-TIME GROUNDING & SANDBOX
    async function loadPromptPreview() {
      try {
        var res = await fetch('/admin/agent-prompt');
        if (!res.ok) return;
        var data = await res.json();

        document.getElementById('grounding-clinics-badge').innerText = '🏥 ' + data.activeClinicsCount + ' Clinics Grounded';
        document.getElementById('grounding-plans-badge').innerText = '🛡️ ' + data.activePlansCount + ' Insurance Plans Grounded';
        document.getElementById('prompt-preview-block').innerText = data.systemPrompt;
      } catch (err) {
        console.error('Error fetching prompt preview:', err);
      }
    }

    async function sendTestMessage(e) {
      e.preventDefault();
      var input = document.getElementById('test-input');
      var submitBtn = document.getElementById('test-submit-btn');
      var userText = input.value.trim();
      if (!userText) return;

      var chatBox = document.getElementById('test-chat-box');

      var userBubble = document.createElement('div');
      userBubble.className = 'chat-bubble chat-user';
      userBubble.innerText = userText;
      chatBox.appendChild(userBubble);
      input.value = '';
      submitBtn.disabled = true;
      submitBtn.innerText = 'Thinking...';

      var typingBubble = document.createElement('div');
      typingBubble.className = 'chat-bubble chat-agent';
      typingBubble.innerText = 'Consulting live database...';
      chatBox.appendChild(typingBubble);
      chatBox.scrollTop = chatBox.scrollHeight;

      try {
        var res = await fetch('/admin/test-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: userText }),
        });

        if (!res.ok) {
          var errData = await res.json();
          throw new Error(errData.message || 'Error generating test reply');
        }

        var data = await res.json();
        var intentHtml = '';
        if (data.detectedLeadIntent) {
          intentHtml = '<div class="chat-agent-intent">🎯 Triage Intent Flagged: ' + escapeHtml(data.detectedLeadIntent) + '</div>';
        }

        typingBubble.innerHTML = escapeHtml(data.reply).replace(/\\n/g, '<br>') + intentHtml;
      } catch (err) {
        typingBubble.innerHTML = '<span style="color: var(--rose);">⚠️ Error: ' + escapeHtml(err.message) + '</span>';
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = 'Send';
        chatBox.scrollTop = chatBox.scrollHeight;
      }
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }
  </script>
</body>
</html>`;
}
