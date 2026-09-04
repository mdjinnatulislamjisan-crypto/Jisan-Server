const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Resend } = require('resend');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

const resend = new Resend(process.env.RESEND_API_KEY);

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

// ---------- Auth-page wrapper ----------
function authPage(title, body) {
    const icons = ['📚', '✏️', '📐', '🖊️', '🎓', '📖', '🧮', '📝', '🔬', '💡', '📁', '🖼️'];
    const floating = icons.map((icon, i) => {
        const left = (i * 8 + 2) % 96;
        const duration = 16 + (i % 5) * 4;
        const delay = i * 1.1;
        const size = 20 + (i % 3) * 10;
        return `<span class="study-icon" style="left:${left}%; animation-duration:${duration}s; animation-delay:-${delay}s; font-size:${size}px;">${icon}</span>`;
    }).join('');

    return `<!DOCTYPE html>
  <html><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} | Jisan Server</title>
  <style>${sharedStyles()}
    body.auth { display:flex; justify-content:center; align-items:center; }
    .auth-card { max-width: 420px; width: 100%; }
  </style></head>
  <body class="auth">
    <div class="study-bg">${floating}</div>
    <div class="bg-orb orb1"></div><div class="bg-orb orb2"></div><div class="bg-orb orb3"></div>
    <div class="card auth-card">
      <div class="brand"><span class="brand-dot"></span><span class="brand-name">JISAN SERVER</span></div>
      ${body}
    </div>
    ${clientScript()}
  </body></html>`;
}

// ---------- App-shell wrapper (file manager dashboard) ----------
function appPage(title, username, activeFolder, folders, mainContent) {
    const sidebarLinks = folders.map(f => `
    <a href="/folder/${encodeURIComponent(f)}" class="side-link ${activeFolder === f ? 'active' : ''}">
      <span class="side-icon">📁</span> ${f}
    </a>`).join('');

    return `<!DOCTYPE html>
  <html><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} | Jisan Server</title>
  <style>${sharedStyles()}
    body.dash { display:block; padding:0; align-items:initial; justify-content:initial; }
    .shell { position:relative; z-index:1; display:flex; min-height:100vh; }
    .sidebar {
      width: 260px; flex-shrink:0; background: rgba(15,23,42,0.75);
      backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
      border-right: 1px solid rgba(148,163,184,0.15); padding: 24px 18px;
      display:flex; flex-direction:column; gap: 20px;
    }
    .sidebar .brand { margin-bottom: 4px; }
    .side-nav { display:flex; flex-direction:column; gap:4px; }
    .side-link {
      display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:10px;
      color:#cbd5e1; font-size:14px; text-decoration:none; transition:0.15s;
    }
    .side-link:hover { background: rgba(56,189,248,0.1); color:#e2e8f0; text-decoration:none; }
    .side-link.active { background: linear-gradient(135deg, rgba(56,189,248,0.25), rgba(99,102,241,0.25)); color:#7dd3fc; font-weight:600; }
    .side-icon { font-size:16px; }
    .side-section-title { font-size:11px; text-transform:uppercase; letter-spacing:1px; color:#64748b; margin: 10px 0 2px 4px; }
    .user-chip { display:flex; align-items:center; gap:10px; padding:10px 12px; background:rgba(30,41,59,0.6); border-radius:12px; border:1px solid rgba(148,163,184,0.15); }
    .avatar { width:34px; height:34px; border-radius:50%; background:linear-gradient(135deg,#38bdf8,#6366f1); display:flex; align-items:center; justify-content:center; font-weight:700; color:#0f172a; }
    .main { flex:1; padding: 28px 34px; min-width:0; }
    .breadcrumb { font-size:13px; color:#94a3b8; margin-bottom:6px; }
    .breadcrumb a { color:#38bdf8; }
    .page-title { font-size:26px; font-weight:700; margin: 0 0 22px 0; color:#f1f5f9; }
    .toolbar { display:flex; gap:12px; margin-bottom:24px; flex-wrap:wrap; align-items:center; }
    .toolbar form { display:flex; gap:8px; align-items:center; margin:0; }
    .toolbar input, .toolbar select { margin:0; width:auto; min-width:160px; }
    .toolbar button { margin:0; width:auto; padding:10px 18px; }
    .btn-ghost { background: rgba(51,65,85,0.6) !important; color:#e2e8f0 !important; border:1px solid rgba(148,163,184,0.25) !important; }
    .empty-state { text-align:center; padding: 60px 20px; color:#64748b; }
    .empty-state .emoji { font-size:42px; margin-bottom:10px; }
    @media (max-width: 800px) {
      .shell { flex-direction:column; }
      .sidebar { width:100%; flex-direction:row; overflow-x:auto; align-items:center; }
      .side-nav { flex-direction:row; }
      .main { padding: 20px; }
    }
  </style></head>
  <body class="dash">
    <div class="bg-orb orb1"></div><div class="bg-orb orb2"></div><div class="bg-orb orb3"></div>
    <div class="shell">
      <aside class="sidebar">
        <div class="brand"><span class="brand-dot"></span><span class="brand-name">JISAN SERVER</span></div>
        <div class="user-chip">
          <div class="avatar">${username.charAt(0).toUpperCase()}</div>
          <div>
            <div style="font-size:13px; font-weight:600; color:#e2e8f0;">${username}</div>
            <div style="font-size:11px; color:#64748b;"><a href="/logout">Log out</a></div>
          </div>
        </div>
        <div>
          <div class="side-section-title">Overview</div>
          <div class="side-nav">
            <a href="/" class="side-link ${!activeFolder ? 'active' : ''}"><span class="side-icon">🏠</span> Dashboard</a>
          </div>
        </div>
        <div>
          <div class="side-section-title">Your Folders</div>
          <div class="side-nav">${sidebarLinks || '<span style="color:#475569; font-size:13px; padding:6px 12px;">No folders yet</span>'}</div>
        </div>
      </aside>
      <main class="main">
        ${mainContent}
      </main>
    </div>
    ${clientScript()}
  </body></html>`;
}

function sharedStyles() {
    return `
    * { box-sizing: border-box; }
    html, body { margin:0; min-height:100%; font-family:'Segoe UI', Roboto, Arial, sans-serif; color:#f1f5f9; overflow-x:hidden; }
    body {
      position:relative; min-height:100vh; padding:40px 20px;
      background: linear-gradient(-45deg, #0b1120, #1e1b4b, #0c4a6e, #1e293b, #3b0764);
      background-size: 400% 400%; animation: gradientMove 22s ease infinite;
    }
    @keyframes gradientMove { 0%{background-position:0% 50%;} 50%{background-position:100% 50%;} 100%{background-position:0% 50%;} }
    .study-bg { position:fixed; top:0; left:0; width:100%; height:100%; overflow:hidden; z-index:0; pointer-events:none; }
    .study-icon { position:absolute; top:110%; opacity:0.16; animation-name:floatUp; animation-timing-function:linear; animation-iteration-count:infinite; filter: drop-shadow(0 0 6px rgba(56,189,248,0.35)); }
    @keyframes floatUp { 0%{transform:translateY(0) rotate(0deg); opacity:0;} 10%{opacity:0.16;} 90%{opacity:0.16;} 100%{transform:translateY(-130vh) rotate(25deg); opacity:0;} }
    .bg-orb { position:fixed; border-radius:50%; filter:blur(70px); opacity:0.28; z-index:0; animation: floatOrb 14s ease-in-out infinite; }
    .orb1 { width:360px; height:360px; background:#38bdf8; top:-80px; left:-80px; animation-duration:16s; }
    .orb2 { width:300px; height:300px; background:#a855f7; bottom:-80px; right:-60px; animation-duration:18s; animation-delay:2s; }
    .orb3 { width:220px; height:220px; background:#f472b6; top:45%; right:8%; animation-duration:22s; animation-delay:4s; }
    @keyframes floatOrb { 0%,100%{transform:translateY(0) translateX(0);} 50%{transform:translateY(-30px) translateX(24px);} }
    .card {
      position:relative; z-index:1; background: rgba(30,41,59,0.68);
      backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
      border-radius:20px; padding:34px 38px; box-shadow: 0 24px 70px rgba(0,0,0,0.55);
      border:1px solid rgba(148,163,184,0.18);
    }
    .brand { display:flex; align-items:center; gap:10px; margin-bottom:18px; }
    .brand-dot { width:12px; height:12px; border-radius:50%; background:#38bdf8; box-shadow:0 0 14px #38bdf8; }
    .brand-name { font-weight:800; letter-spacing:0.8px; background:linear-gradient(90deg,#38bdf8,#a855f7); -webkit-background-clip:text; background-clip:text; color:transparent; font-size:16px; }
    h1 { font-size:22px; margin-top:0; color:#e2e8f0; }
    h3 { color:#93c5fd; margin-bottom:8px; }
    a { color:#38bdf8; text-decoration:none; }
    a:hover { text-decoration:underline; }
    input, select, button {
      width:100%; padding:12px 14px; margin:6px 0 14px 0; border-radius:12px;
      border:1px solid #334155; background: rgba(15,23,42,0.8); color:#f1f5f9; font-size:14px;
    }
    input:focus, select:focus { outline:none; border-color:#38bdf8; box-shadow:0 0 0 3px rgba(56,189,248,0.15); }
    button {
      background: linear-gradient(135deg, #38bdf8, #6366f1); color:#0b1120; font-weight:700;
      border:none; cursor:pointer; transition:0.2s; letter-spacing:0.3px;
    }
    button:hover { filter:brightness(1.12); transform:translateY(-1px); }
    .small-link { font-size:13px; color:#94a3b8; }
    .pw-wrapper { position:relative; }
    .pw-wrapper input { padding-right:42px; }
    .pw-toggle { position:absolute; right:10px; top:8px; cursor:pointer; background:none !important; border:none; width:auto; padding:0; margin:0; font-size:16px; color:#94a3b8; }
    .grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap:16px; }
    .file-card { background: rgba(15,23,42,0.85); border:1px solid #334155; border-radius:14px; padding:10px; text-align:center; transition:0.2s; }
    .file-card:hover { border-color:#38bdf8; transform: translateY(-3px); box-shadow: 0 10px 24px rgba(56,189,248,0.15); }
    .thumb { width:100%; height:105px; object-fit:cover; border-radius:10px; background:#1e293b; }
    .filetype { display:flex; align-items:center; justify-content:center; height:105px; color:#94a3b8; font-weight:700; font-size:13px; background:#1e293b; border-radius:10px; }
    .filename { font-size:12px; color:#cbd5e1; margin:8px 0 4px 0; word-break:break-word; }
    .download-link { font-size:12px; }
    .folder-card { background: rgba(15,23,42,0.7); border:1px solid #334155; border-radius:16px; padding:20px; text-align:center; transition:0.2s; display:block; }
    .folder-card:hover { border-color:#a855f7; transform: translateY(-3px); text-decoration:none; }
    .folder-icon { font-size:34px; margin-bottom:8px; }
    .folder-name { font-size:14px; color:#e2e8f0; font-weight:600; word-break:break-word; }
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
    <p>Already have an account? <a href="/login">Log in</a></p>
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
        await resend.emails.send({
            from: 'Jisan Server <onboarding@resend.dev>',
            to: cleanEmail,
            subject: 'Verify your Jisan Server account',
            html: `<p>Hi ${clean},</p><p>Click below to verify your account:</p><p><a href="${verifyLink}">${verifyLink}</a></p>`
        });
    } catch (err) {
        console.error('Email send failed:', err.message);
        return res.send(`Account created, but the verification email failed to send (${err.message}). <a href="/resend-verification">Try resending</a> | <a href="/login">Go to login</a>`);
    }

    res.send(authPage('Check your email', `
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
    res.send(authPage('Verified', `<h1>Email verified!</h1><p>Your account is now active.</p><p><a href="/login">Log in now</a></p>`));
});

// ---------- Resend verification ----------
app.get('/resend-verification', (req, res) => {
    res.send(authPage('Resend Verification', `
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
        await resend.emails.send({
            from: 'Jisan Server <onboarding@resend.dev>',
            to: user.email,
            subject: 'Verify your Jisan Server account (resent)',
            html: `<p>Hi ${user.username},</p><p>Here's your verification link again:</p><p><a href="${verifyLink}">${verifyLink}</a></p>`
        });
    } catch (err) {
        console.error('Resend email failed:', err.message);
        return res.send(`Failed to resend email: ${err.message} <a href="/resend-verification">Try again</a>`);
    }

    res.send(authPage('Email resent', `<h1>Verification email resent!</h1><p>Check <strong>${user.email}</strong>.</p><p><a href="/login">Back to login</a></p>`));
});

// ---------- Login / Logout ----------
app.get('/login', (req, res) => {
    res.send(authPage('Login', `
    <h1>Log in to Jisan Server</h1>
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
    <p>No account yet? <a href="/register">Register</a></p>
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
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) preview = `<img src="${url}" class="thumb" />`;
    else if (['.mp4', '.webm', '.mov'].includes(ext)) preview = `<video src="${url}" class="thumb" controls></video>`;
    else if (ext === '.pdf') preview = `<embed src="${url}" class="thumb" type="application/pdf" />`;
    else preview = `<div class="filetype">${ext.replace('.', '').toUpperCase() || 'FILE'}</div>`;
    return `<div class="file-card">${preview}<p class="filename">${f}</p><a href="${url}" download class="download-link">Download</a></div>`;
}

// ---------- Dashboard ----------
app.get('/', requireLogin, (req, res) => {
    const username = req.session.username;
    const folders = getFolders(username);
    const folderOptions = folders.map(f => `<option value="${f}">${f}</option>`).join('');

    const folderCards = folders.map(f => `
    <a href="/folder/${encodeURIComponent(f)}" class="folder-card">
      <div class="folder-icon">📁</div>
      <div class="folder-name">${f}</div>
    </a>`).join('');

    const main = `
    <div class="breadcrumb">Home</div>
    <h1 class="page-title">Welcome back, ${username}</h1>
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
    <h3>Your Folders</h3>
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
    <h1 class="page-title">${folder}</h1>
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

app.listen(PORT, () => {
    console.log(`Jisan Server running at ${BASE_URL}`);
});