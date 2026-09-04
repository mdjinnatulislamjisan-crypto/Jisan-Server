const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

async function sendMail({ to, subject, html }) {
  const auth = Buffer.from(`${process.env.MAILJET_API_KEY}:${process.env.MAILJET_API_SECRET}`).toString('base64');
  const res = await fetch('https://api.mailjet.com/v3.1/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${auth}`
    },
    body: JSON.stringify({
      Messages: [{
        From: { Email: process.env.MAILJET_SENDER_EMAIL, Name: 'Jisan Server' },
        To: [{ Email: to }],
        Subject: subject,
        HTMLPart: html
      }]
    })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Mailjet error (${res.status}): ${errText}`);
  }
}
const DATA_DIR = path.join(__dirname, 'my-files');
const USERS_FILE = path.join(__dirname, 'users.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');

function getUsers() { return JSON.parse(fs.readFileSync(USERS_FILE)); }
function saveUsers(users) { fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2)); }

app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-to-something-random-and-long',
  resave: false,
  saveUninitialized: false
}));

// ---------- Design helpers ----------
const ACCENTS = ['#7c3aed', '#e11d48', '#0ea5e9', '#f59e0b', '#10b981', '#ec4899', '#6366f1'];
function accentFor(name) {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}
function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return 'Still up,';
  if (hour < 12) return 'Good morning,';
  if (hour < 17) return 'Good afternoon,';
  if (hour < 21) return 'Good evening,';
  return 'Working late,';
}
function initials(name) {
  return String(name).charAt(0).toUpperCase();
}

// ---------- Auth-page wrapper ----------
function authPage(title, body) {
  return `<!DOCTYPE html>
  <html><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} | Vault</title>
  ${fontsLink()}
  <style>${sharedStyles()}
    body.auth { display:flex; justify-content:center; align-items:center; }
    .auth-shell { position:relative; z-index:1; width:100%; max-width:920px; display:grid; grid-template-columns: 1.05fr 1fr; border-radius:24px; overflow:hidden; box-shadow: 0 40px 100px rgba(3,7,18,0.55); }
    .auth-pitch {
      background: linear-gradient(155deg, rgba(124,58,237,0.35), rgba(14,165,233,0.28) 55%, rgba(16,185,129,0.22));
      backdrop-filter: blur(6px);
      padding: 46px 40px; display:flex; flex-direction:column; justify-content:space-between;
      border-right: 1px solid rgba(255,255,255,0.08);
    }
    .auth-pitch h2 { font-family:'Space Grotesk',sans-serif; font-size:28px; line-height:1.25; margin:18px 0 12px; color:#f8fafc; }
    .auth-pitch p { color:#cbd5e1; font-size:14px; line-height:1.6; max-width:32ch; }
    .pitch-stack { display:flex; flex-direction:column; gap:14px; margin-top:26px; }
    .pitch-row { display:flex; align-items:center; gap:12px; font-size:13px; color:#e2e8f0; }
    .pitch-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
    .auth-card { background: rgba(15,20,35,0.82); padding:44px 40px; }
    @media (max-width: 760px) {
      .auth-shell { grid-template-columns: 1fr; max-width:420px; }
      .auth-pitch { display:none; }
    }
  </style></head>
  <body class="auth">
    ${meshBackground()}
    <div class="auth-shell">
      <div class="auth-pitch">
        <div>
          <div class="brand"><span class="brand-mark">V</span><span class="brand-name">VAULT</span></div>
          <h2>Your files, organized like they matter.</h2>
          <p>A personal file space built for students: folders that make sense, previews that load instantly, nothing to configure.</p>
        </div>
        <div class="pitch-stack">
          <div class="pitch-row"><span class="pitch-dot" style="background:#7c3aed"></span>Folder-first organization</div>
          <div class="pitch-row"><span class="pitch-dot" style="background:#0ea5e9"></span>Instant image, video &amp; PDF previews</div>
          <div class="pitch-row"><span class="pitch-dot" style="background:#10b981"></span>Signed in, secured, yours only</div>
        </div>
      </div>
      <div class="card auth-card">
        ${body}
      </div>
    </div>
    ${clientScript()}
  </body></html>`;
}

// ---------- App-shell wrapper (file manager dashboard) ----------
function appPage(title, username, activeFolder, folders, mainContent) {
  const sidebarLinks = folders.map(f => `
    <a href="/folder/${encodeURIComponent(f)}" class="side-link ${activeFolder === f ? 'active' : ''}">
      <span class="side-dot" style="background:${accentFor(f)}"></span>
      <span class="side-label">${f}</span>
    </a>`).join('');

  return `<!DOCTYPE html>
  <html><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} | Vault</title>
  ${fontsLink()}
  <style>${sharedStyles()}
    body.dash { display:block; padding:0; align-items:initial; justify-content:initial; }
    .shell { position:relative; z-index:1; display:flex; min-height:100vh; }
    .sidebar {
      width: 264px; flex-shrink:0; background: rgba(13,17,30,0.78);
      backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
      border-right: 1px solid rgba(255,255,255,0.07); padding: 26px 20px;
      display:flex; flex-direction:column; gap: 22px;
    }
    .sidebar .brand { margin-bottom: 2px; }
    .side-nav { display:flex; flex-direction:column; gap:3px; }
    .side-link {
      display:flex; align-items:center; gap:11px; padding:10px 12px; border-radius:11px;
      color:#aab4c8; font-size:14px; text-decoration:none; transition:0.15s; font-weight:500;
    }
    .side-link:hover { background: rgba(255,255,255,0.06); color:#f1f5f9; text-decoration:none; }
    .side-link.active { background: rgba(124,58,237,0.18); color:#e9d5ff; }
    .side-dot { width:9px; height:9px; border-radius:50%; flex-shrink:0; box-shadow: 0 0 8px currentColor; }
    .side-home { font-size:16px; }
    .side-section-title { font-size:11px; text-transform:uppercase; letter-spacing:1.2px; color:#5b6478; margin: 4px 0 0 4px; font-weight:600; }
    .user-chip { display:flex; align-items:center; gap:11px; padding:11px 12px; background:rgba(255,255,255,0.04); border-radius:14px; border:1px solid rgba(255,255,255,0.07); }
    .avatar { width:36px; height:36px; border-radius:11px; background:linear-gradient(135deg,#7c3aed,#0ea5e9); display:flex; align-items:center; justify-content:center; font-weight:700; color:#fff; font-family:'Space Grotesk',sans-serif; flex-shrink:0; }
    .stat-row { display:flex; gap:10px; }
    .stat-chip { flex:1; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.07); border-radius:12px; padding:10px 12px; }
    .stat-num { font-family:'Space Grotesk',sans-serif; font-size:19px; font-weight:700; color:#f1f5f9; line-height:1.1; }
    .stat-label { font-size:10.5px; color:#7a869c; margin-top:2px; text-transform:uppercase; letter-spacing:0.6px; }
    .main { flex:1; padding: 32px 40px; min-width:0; }
    .breadcrumb { font-size:13px; color:#7a869c; margin-bottom:8px; }
    .breadcrumb a { color:#7dd3fc; }
    .page-head { display:flex; align-items:flex-end; justify-content:space-between; flex-wrap:wrap; gap:16px; margin-bottom:26px; }
    .page-title { font-family:'Space Grotesk',sans-serif; font-size:28px; font-weight:700; margin: 0; color:#f8fafc; letter-spacing:-0.3px; }
    .page-sub { font-size:13px; color:#7a869c; margin-top:4px; }
    .search-box { position:relative; width:230px; }
    .search-box input { margin:0; padding-left:36px; background:rgba(255,255,255,0.05); }
    .search-box::before { content:'⌕'; position:absolute; left:13px; top:50%; transform:translateY(-50%); color:#7a869c; font-size:15px; }
    .toolbar { display:flex; gap:12px; margin-bottom:28px; flex-wrap:wrap; align-items:center; }
    .toolbar form { display:flex; gap:8px; align-items:center; margin:0; }
    .toolbar input, .toolbar select { margin:0; width:auto; min-width:160px; }
    .toolbar button { margin:0; width:auto; padding:11px 20px; }
    .btn-ghost { background: rgba(255,255,255,0.05) !important; color:#e2e8f0 !important; border:1px solid rgba(255,255,255,0.12) !important; }
    .empty-state { text-align:center; padding: 70px 20px; color:#5b6478; border:1px dashed rgba(255,255,255,0.1); border-radius:18px; }
    .empty-state .emoji { font-size:38px; margin-bottom:10px; }
    .section-label { font-size:11px; text-transform:uppercase; letter-spacing:1.2px; color:#5b6478; font-weight:700; margin: 0 0 14px 0; }
    @media (max-width: 800px) {
      .shell { flex-direction:column; }
      .sidebar { width:100%; flex-direction:row; overflow-x:auto; align-items:center; }
      .side-nav { flex-direction:row; }
      .stat-row { display:none; }
      .main { padding: 22px; }
      .search-box { width:100%; }
    }
  </style></head>
  <body class="dash">
    ${meshBackground()}
    <div class="shell">
      <aside class="sidebar">
        <div class="brand"><span class="brand-mark">V</span><span class="brand-name">VAULT</span></div>
        <div class="user-chip">
          <div class="avatar">${initials(username)}</div>
          <div style="min-width:0;">
            <div style="font-size:13px; font-weight:600; color:#e2e8f0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${username}</div>
            <div style="font-size:11px; color:#7a869c;"><a href="/logout">Log out</a></div>
          </div>
        </div>
        <div class="stat-row">
          <div class="stat-chip"><div class="stat-num">${folders.length}</div><div class="stat-label">Folders</div></div>
          <div class="stat-chip"><div class="stat-num">${folders.reduce((n, f) => n + fs.readdirSync(path.join(userDir(username), f)).length, 0)}</div><div class="stat-label">Files</div></div>
        </div>
        <div>
          <div class="side-section-title">Overview</div>
          <div class="side-nav">
            <a href="/" class="side-link ${!activeFolder ? 'active' : ''}"><span class="side-home">⌂</span> Dashboard</a>
          </div>
        </div>
        <div style="flex:1; overflow-y:auto;">
          <div class="side-section-title">Your Folders</div>
          <div class="side-nav">${sidebarLinks || '<span style="color:#5b6478; font-size:13px; padding:6px 12px;">No folders yet</span>'}</div>
        </div>
      </aside>
      <main class="main">
        ${mainContent}
      </main>
    </div>
    ${clientScript()}
  </body></html>`;
}

function fontsLink() {
  return `<link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">`;
}

function meshBackground() {
  return `<div class="mesh"><div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div><div class="blob b4"></div></div>`;
}

function sharedStyles() {
  return `
    * { box-sizing: border-box; }
    html, body { margin:0; min-height:100%; font-family:'Inter', Arial, sans-serif; color:#f1f5f9; overflow-x:hidden; }
    body {
      position:relative; min-height:100vh; padding:40px 20px;
      background:#080b14;
    }
    .mesh { position:fixed; inset:0; z-index:0; overflow:hidden; pointer-events:none; }
    .blob { position:absolute; border-radius:50%; filter:blur(90px); animation: drift 26s ease-in-out infinite; }
    .b1 { width:520px; height:520px; background:#7c3aed; opacity:0.32; top:-160px; left:-120px; animation-duration:24s; }
    .b2 { width:460px; height:460px; background:#0ea5e9; opacity:0.26; bottom:-140px; right:-100px; animation-duration:29s; animation-delay:2s; }
    .b3 { width:380px; height:380px; background:#f59e0b; opacity:0.18; top:38%; right:12%; animation-duration:32s; animation-delay:5s; }
    .b4 { width:320px; height:320px; background:#10b981; opacity:0.18; bottom:18%; left:8%; animation-duration:27s; animation-delay:8s; }
    @keyframes drift { 0%,100%{transform:translate(0,0) scale(1);} 50%{transform:translate(30px,-26px) scale(1.06);} }
    .card {
      position:relative; z-index:1;
      backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
      box-shadow: 0 24px 70px rgba(0,0,0,0.5);
    }
    .brand { display:flex; align-items:center; gap:10px; margin-bottom:22px; }
    .brand-mark { width:30px; height:30px; border-radius:9px; background:linear-gradient(135deg,#7c3aed,#0ea5e9); display:flex; align-items:center; justify-content:center; font-family:'Space Grotesk',sans-serif; font-weight:700; color:#fff; font-size:15px; flex-shrink:0; }
    .brand-name { font-family:'Space Grotesk',sans-serif; font-weight:700; letter-spacing:1.5px; color:#f1f5f9; font-size:15px; }
    h1 { font-family:'Space Grotesk',sans-serif; font-size:24px; margin-top:0; margin-bottom:6px; color:#f8fafc; font-weight:700; letter-spacing:-0.3px; }
    h3 { color:#a5b4fc; margin-bottom:8px; font-size:14px; }
    a { color:#7dd3fc; text-decoration:none; }
    a:hover { text-decoration:underline; }
    input, select, button {
      width:100%; padding:12px 14px; margin:6px 0 14px 0; border-radius:12px;
      border:1px solid rgba(255,255,255,0.12); background: rgba(8,11,20,0.6); color:#f1f5f9; font-size:14px;
      font-family:'Inter',sans-serif;
    }
    input:focus, select:focus { outline:none; border-color:#7c3aed; box-shadow:0 0 0 3px rgba(124,58,237,0.18); }
    button {
      background: linear-gradient(135deg, #7c3aed, #0ea5e9); color:#fff; font-weight:700;
      border:none; cursor:pointer; transition:0.2s; letter-spacing:0.2px;
    }
    button:hover { filter:brightness(1.1); transform:translateY(-1px); }
    .small-link { font-size:13px; color:#7a869c; }
    .pw-wrapper { position:relative; }
    .pw-wrapper input { padding-right:42px; }
    .pw-toggle { position:absolute; right:10px; top:8px; cursor:pointer; background:none !important; border:none; width:auto; padding:0; margin:0; font-size:16px; color:#7a869c; }
    .grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(158px, 1fr)); gap:16px; }
    .file-card { position:relative; background: rgba(255,255,255,0.035); border:1px solid rgba(255,255,255,0.09); border-radius:15px; padding:12px; text-align:center; transition:0.2s; overflow:hidden; }
    .file-card::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; background:var(--accent,#7c3aed); }
    .file-card:hover { border-color:rgba(255,255,255,0.22); transform: translateY(-3px); box-shadow: 0 12px 28px rgba(0,0,0,0.35); }
    .thumb { width:100%; height:105px; object-fit:cover; border-radius:9px; background:#11172a; }
    .filetype { display:flex; align-items:center; justify-content:center; height:105px; color:#e2e8f0; font-weight:700; font-size:12.5px; letter-spacing:0.5px; background:rgba(255,255,255,0.05); border-radius:9px; }
    .filename { font-size:12px; color:#cbd5e1; margin:9px 0 5px 0; word-break:break-word; }
    .download-link { font-size:12px; font-weight:600; }
    .folder-card { position:relative; background: rgba(255,255,255,0.035); border:1px solid rgba(255,255,255,0.09); border-radius:17px; padding:22px 18px; text-align:left; transition:0.2s; display:block; overflow:hidden; }
    .folder-card::before { content:''; position:absolute; top:0; left:0; bottom:0; width:3px; background:var(--accent,#7c3aed); }
    .folder-card:hover { border-color:rgba(255,255,255,0.22); transform: translateY(-3px); text-decoration:none; box-shadow: 0 14px 30px rgba(0,0,0,0.35); }
    .folder-icon { width:38px; height:38px; border-radius:11px; background:var(--accent,#7c3aed); opacity:0.9; display:flex; align-items:center; justify-content:center; font-size:17px; margin-bottom:14px; }
    .folder-name { font-size:14.5px; color:#f1f5f9; font-weight:600; word-break:break-word; }
    .folder-meta { font-size:11.5px; color:#7a869c; margin-top:3px; }
  `;
}

function clientScript() {
  return `<script>
    function togglePassword(id) {
      const input = document.getElementById(id);
      const btn = document.getElementById(id + '-eye');
      if (input.type === 'password') { input.type='text'; btn.textContent='🙈'; }
      else { input.type='password'; btn.textContent='👁️'; }
    }
    function liveFilter(inputEl, selector) {
      const q = inputEl.value.trim().toLowerCase();
      document.querySelectorAll(selector).forEach(el => {
        const name = (el.getAttribute('data-name') || '').toLowerCase();
        el.style.display = name.includes(q) ? '' : 'none';
      });
    }
  </script>`;
}

// ---------- Auth helpers ----------
function requireLogin(req, res, next) {
  if (!req.session.username) return res.redirect('/login');
  next();
}
function userDir(username) {
  const dir = path.join(DATA_DIR, username);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function getFolders(username) {
  const dir = userDir(username);
  return fs.readdirSync(dir).filter(f => fs.statSync(path.join(dir, f)).isDirectory());
}

// ---------- Register ----------
app.get('/register', (req, res) => {
  res.send(authPage('Register', `
    <div class="brand"><span class="brand-mark">V</span><span class="brand-name">VAULT</span></div>
    <h1>Create your account</h1>
    <form method="post" action="/register">
      <input name="username" placeholder="Choose a username" required />
      <input name="email" type="email" placeholder="Your email address" required />
      <div class="pw-wrapper">
        <input id="reg-pw" name="password" type="password" placeholder="Choose a password" required />
        <button type="button" id="reg-pw-eye" class="pw-toggle" onclick="togglePassword('reg-pw')">👁️</button>
      </div>
      <input name="securityQuestion" placeholder="Security question" required />
      <input name="securityAnswer" placeholder="Answer to your security question" required />
      <button type="submit">Create Account</button>
    </form>
    <p class="small-link">Already have an account? <a href="/login">Log in</a></p>
  `));
});

app.post('/register', async (req, res) => {
  const { username, email, password, securityQuestion, securityAnswer } = req.body;
  const clean = (username || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!clean || !cleanEmail || !password || !securityQuestion || !securityAnswer) {
    return res.send('All fields are required. <a href="/register">Back</a>');
  }
  const users = getUsers();
  if (users.find(u => u.username === clean)) return res.send('Username already taken. <a href="/register">Back</a>');
  if (users.find(u => u.email === cleanEmail)) return res.send('Email already registered. <a href="/register">Back</a>');

  const hash = await bcrypt.hash(password, 10);
  const answerHash = await bcrypt.hash(securityAnswer.trim().toLowerCase(), 10);
  const verifyToken = crypto.randomBytes(24).toString('hex');

  users.push({ username: clean, email: cleanEmail, password: hash, securityQuestion: securityQuestion.trim(), securityAnswer: answerHash, verified: false, verifyToken });
  saveUsers(users);
  userDir(clean);

  const verifyLink = `${BASE_URL}/verify-email?token=${verifyToken}`;
  try {
    await sendMail({
      to: cleanEmail,
      subject: 'Verify your Vault account',
      html: `<p>Hi ${clean},</p><p>Click below to verify your account:</p><p><a href="${verifyLink}">${verifyLink}</a></p>`
    });
  } catch (err) {
    console.error('Email send failed:', err.message);
    return res.send(`Account created, but the verification email failed to send (${err.message}). <a href="/resend-verification">Try resending</a> | <a href="/login">Go to login</a>`);
  }

  res.send(authPage('Check your email', `
    <div class="brand"><span class="brand-mark">V</span><span class="brand-name">VAULT</span></div>
    <h1>Verify your email</h1>
    <p>We sent a verification link to <strong>${cleanEmail}</strong>. Click it before logging in.</p>
    <p><a href="/login">Back to login</a></p>
  `));
});

// ---------- Email verification ----------
app.get('/verify-email', (req, res) => {
  const { token } = req.query;
  const users = getUsers();
  const user = users.find(u => u.verifyToken === token);
  if (!user) return res.send('Invalid or expired verification link. <a href="/login">Back to login</a>');
  user.verified = true;
  delete user.verifyToken;
  saveUsers(users);
  res.send(authPage('Verified', `<div class="brand"><span class="brand-mark">V</span><span class="brand-name">VAULT</span></div><h1>Email verified!</h1><p>Your account is now active.</p><p><a href="/login">Log in now</a></p>`));
});

// ---------- Resend verification ----------
app.get('/resend-verification', (req, res) => {
  res.send(authPage('Resend Verification', `
    <div class="brand"><span class="brand-mark">V</span><span class="brand-name">VAULT</span></div>
    <h1>Resend verification email</h1>
    <form method="post" action="/resend-verification">
      <input name="username" placeholder="Enter your username" required />
      <button type="submit">Resend Email</button>
    </form>
    <p class="small-link"><a href="/login">Back to login</a></p>
  `));
});

app.post('/resend-verification', async (req, res) => {
  const clean = (req.body.username || '').trim().toLowerCase();
  const users = getUsers();
  const user = users.find(u => u.username === clean);
  if (!user) return res.send('No account found with that username. <a href="/resend-verification">Try again</a>');
  if (user.verified) return res.send('This account is already verified. <a href="/login">Log in</a>');

  const newToken = crypto.randomBytes(24).toString('hex');
  user.verifyToken = newToken;
  saveUsers(users);

  const verifyLink = `${BASE_URL}/verify-email?token=${newToken}`;
  try {
    await sendMail({
      to: user.email,
      subject: 'Verify your Vault account (resent)',
      html: `<p>Hi ${user.username},</p><p>Here's your verification link again:</p><p><a href="${verifyLink}">${verifyLink}</a></p>`
    });
  } catch (err) {
    console.error('Resend email failed:', err.message);
    return res.send(`Failed to resend email: ${err.message} <a href="/resend-verification">Try again</a>`);
  }

  res.send(authPage('Email resent', `<div class="brand"><span class="brand-mark">V</span><span class="brand-name">VAULT</span></div><h1>Verification email resent!</h1><p>Check <strong>${user.email}</strong>.</p><p><a href="/login">Back to login</a></p>`));
});

// ---------- Login / Logout ----------
app.get('/login', (req, res) => {
  res.send(authPage('Login', `
    <div class="brand"><span class="brand-mark">V</span><span class="brand-name">VAULT</span></div>
    <h1>Log in to Vault</h1>
    <form method="post" action="/login">
      <input name="username" placeholder="Username" required />
      <div class="pw-wrapper">
        <input id="login-pw" name="password" type="password" placeholder="Password" required />
        <button type="button" id="login-pw-eye" class="pw-toggle" onclick="togglePassword('login-pw')">👁️</button>
      </div>
      <button type="submit">Log In</button>
    </form>
    <p class="small-link"><a href="/forgot-password">Forgot your password?</a></p>
    <p class="small-link"><a href="/resend-verification">Didn't get the verification email?</a></p>
    <p class="small-link">No account yet? <a href="/register">Register</a></p>
  `));
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const clean = (username || '').trim().toLowerCase();
  const users = getUsers();
  const user = users.find(u => u.username === clean);
  if (!user) return res.send('Wrong username or password. <a href="/login">Try again</a>');
  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.send('Wrong username or password. <a href="/login">Try again</a>');
  if (!user.verified) return res.send('Please verify your email before logging in. <a href="/resend-verification">Resend email</a>');
  req.session.username = clean;
  res.redirect('/');
});

app.get('/logout', (req, res) => { req.session.destroy(() => res.redirect('/login')); });

// ---------- Forgot password ----------
app.get('/forgot-password', (req, res) => {
  res.send(authPage('Forgot Password', `
    <div class="brand"><span class="brand-mark">V</span><span class="brand-name">VAULT</span></div>
    <h1>Reset your password</h1>
    <form method="get" action="/forgot-password/question">
      <input name="username" placeholder="Enter your username" required />
      <button type="submit">Continue</button>
    </form>
    <p class="small-link"><a href="/login">Back to login</a></p>
  `));
});

app.get('/forgot-password/question', (req, res) => {
  const clean = (req.query.username || '').trim().toLowerCase();
  const users = getUsers();
  const user = users.find(u => u.username === clean);
  if (!user) return res.send('No account found. <a href="/forgot-password">Try again</a>');
  res.send(authPage('Security Question', `
    <div class="brand"><span class="brand-mark">V</span><span class="brand-name">VAULT</span></div>
    <h1>Security Question</h1>
    <form method="post" action="/forgot-password/reset">
      <input type="hidden" name="username" value="${user.username}" />
      <p>${user.securityQuestion}</p>
      <input name="answer" placeholder="Your answer" required />
      <div class="pw-wrapper">
        <input id="new-pw" name="newPassword" type="password" placeholder="New password" required />
        <button type="button" id="new-pw-eye" class="pw-toggle" onclick="togglePassword('new-pw')">👁️</button>
      </div>
      <button type="submit">Reset Password</button>
    </form>
    <p class="small-link"><a href="/login">Back to login</a></p>
  `));
});

app.post('/forgot-password/reset', async (req, res) => {
  const { username, answer, newPassword } = req.body;
  const clean = (username || '').trim().toLowerCase();
  const users = getUsers();
  const user = users.find(u => u.username === clean);
  if (!user) return res.send('Account not found. <a href="/forgot-password">Try again</a>');
  const correct = await bcrypt.compare((answer || '').trim().toLowerCase(), user.securityAnswer);
  if (!correct) return res.send('Incorrect answer. <a href="/forgot-password">Try again</a>');
  if (!newPassword || newPassword.length < 3) return res.send('Password too short. <a href="/forgot-password">Try again</a>');
  user.password = await bcrypt.hash(newPassword, 10);
  saveUsers(users);
  res.send('Password reset successfully! <a href="/login">Log in now</a>');
});

// ---------- File storage ----------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = (req.body.folder || 'general').replace(/[^a-zA-Z0-9_-]/g, '');
    const dest = path.join(userDir(req.session.username), folder);
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

function fileCardHtml(folder, f) {
  const ext = path.extname(f).toLowerCase();
  const url = `/files/${folder}/${encodeURIComponent(f)}`;
  let preview = '';
  let accent = '#0ea5e9';
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) { preview = `<img src="${url}" class="thumb" />`; accent = '#7c3aed'; }
  else if (['.mp4', '.webm', '.mov'].includes(ext)) { preview = `<video src="${url}" class="thumb" controls></video>`; accent = '#e11d48'; }
  else if (ext === '.pdf') { preview = `<embed src="${url}" class="thumb" type="application/pdf" />`; accent = '#f59e0b'; }
  else { preview = `<div class="filetype">${ext.replace('.', '').toUpperCase() || 'FILE'}</div>`; accent = '#10b981'; }
  return `<div class="file-card" style="--accent:${accent}" data-name="${f.toLowerCase()}">${preview}<p class="filename">${f}</p><a href="${url}" download class="download-link">Download</a></div>`;
}

// ---------- Dashboard ----------
app.get('/', requireLogin, (req, res) => {
  const username = req.session.username;
  const folders = getFolders(username);
  const folderOptions = folders.map(f => `<option value="${f}">${f}</option>`).join('');
  const totalFiles = folders.reduce((n, f) => n + fs.readdirSync(path.join(userDir(username), f)).length, 0);

  const folderCards = folders.map(f => {
    const count = fs.readdirSync(path.join(userDir(username), f)).length;
    return `
    <a href="/folder/${encodeURIComponent(f)}" class="folder-card" style="--accent:${accentFor(f)}" data-name="${f.toLowerCase()}">
      <div class="folder-icon">📁</div>
      <div class="folder-name">${f}</div>
      <div class="folder-meta">${count} file${count === 1 ? '' : 's'}</div>
    </a>`;
  }).join('');

  const main = `
    <div class="breadcrumb">Home</div>
    <div class="page-head">
      <div>
        <h1 class="page-title">${greeting()} ${username}</h1>
        <div class="page-sub">${folders.length} folder${folders.length === 1 ? '' : 's'} · ${totalFiles} file${totalFiles === 1 ? '' : 's'} total</div>
      </div>
      <div class="search-box"><input type="text" placeholder="Search folders..." oninput="liveFilter(this, '.folder-card')" /></div>
    </div>
    <div class="toolbar">
      <form method="post" action="/create-folder">
        <input name="foldername" placeholder="New folder name" required />
        <button type="submit">+ Create Folder</button>
      </form>
      <form method="post" action="/upload" enctype="multipart/form-data">
        <select name="folder">
          <option value="general">general</option>
          ${folderOptions}
        </select>
        <input type="file" name="myfile" required />
        <button type="submit" class="btn-ghost">Upload File</button>
      </form>
    </div>
    <p class="section-label">Your Folders</p>
    ${folders.length ? `<div class="grid">${folderCards}</div>` : `
      <div class="empty-state"><div class="emoji">📂</div><p>No folders yet — create one above to get started.</p></div>
    `}
  `;

  res.send(appPage('Dashboard', username, null, folders, main));
});

app.post('/create-folder', requireLogin, (req, res) => {
  const folder = (req.body.foldername || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!folder) return res.send('Invalid folder name. <a href="/">Back</a>');
  fs.mkdirSync(path.join(userDir(req.session.username), folder), { recursive: true });
  res.redirect('/');
});

app.post('/upload', requireLogin, upload.single('myfile'), (req, res) => {
  const folder = (req.body.folder || 'general').replace(/[^a-zA-Z0-9_-]/g, '');
  res.redirect(`/folder/${encodeURIComponent(folder)}`);
});

// ---------- Folder view ----------
app.get('/folder/:folder', requireLogin, (req, res) => {
  const username = req.session.username;
  const folders = getFolders(username);
  const folder = req.params.folder;
  const folderPath = path.join(userDir(username), folder);

  if (!folders.includes(folder)) {
    return res.send(appPage('Not found', username, null, folders, `<div class="empty-state"><div class="emoji">🚫</div><p>Folder not found.</p></div>`));
  }

  const files = fs.readdirSync(folderPath);
  const cards = files.map(f => fileCardHtml(folder, f)).join('');

  const main = `
    <div class="breadcrumb"><a href="/">Home</a> / ${folder}</div>
    <div class="page-head">
      <div>
        <h1 class="page-title">${folder}</h1>
        <div class="page-sub">${files.length} file${files.length === 1 ? '' : 's'}</div>
      </div>
      <div class="search-box"><input type="text" placeholder="Search files..." oninput="liveFilter(this, '.file-card')" /></div>
    </div>
    <div class="toolbar">
      <form method="post" action="/upload" enctype="multipart/form-data">
        <input type="hidden" name="folder" value="${folder}" />
        <input type="file" name="myfile" required />
        <button type="submit">Upload to "${folder}"</button>
      </form>
    </div>
    ${files.length ? `<div class="grid">${cards}</div>` : `
      <div class="empty-state"><div class="emoji">🗂️</div><p>This folder is empty — upload your first file above.</p></div>
    `}
  `;

  res.send(appPage(folder, username, folder, folders, main));
});

app.get('/files/:folder/:filename', requireLogin, (req, res) => {
  const base = userDir(req.session.username);
  const filePath = path.join(base, req.params.folder, req.params.filename);
  if (!filePath.startsWith(base)) return res.status(403).send('Forbidden');
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
  res.sendFile(filePath);
});
app.get('/admin/users', (req, res) => {
  try {
    const users = getUsers();

    const safeUsers = users.map(user => ({
      username: user.username,
      email: user.email,
      verified: user.verified
    }));

    res.json(safeUsers);
  } catch (err) {
    console.error(err);
    res.status(500).send('Could not read users.json');
  }
});
app.listen(PORT, () => {
  console.log(`Vault (Jisan Server) running at ${BASE_URL}`);
});