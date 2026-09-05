const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const mongoose = require('mongoose');
const Mailjet = require('node-mailjet');

process.on('uncaughtException', (err) => console.error('UNCAUGHT EXCEPTION:', err));
process.on('unhandledRejection', (err) => console.error('UNHANDLED REJECTION:', err));

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err.message));

// ---------- Schemas ----------
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  securityQuestion: String,
  securityAnswer: String,
  verified: { type: Boolean, default: false },
  verifyToken: String,
  banned: { type: Boolean, default: false },
  banReason: String
});
const User = mongoose.model('User', userSchema);

const loginAttemptSchema = new mongoose.Schema({
  username: String,
  success: Boolean,
  ip: String,
  userAgent: String,
  timestamp: { type: Date, default: Date.now }
});
const LoginAttempt = mongoose.model('LoginAttempt', loginAttemptSchema);

const supportMessageSchema = new mongoose.Schema({
  username: String,
  message: String,
  fromAdmin: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now }
});
const SupportMessage = mongoose.model('SupportMessage', supportMessageSchema);

const reportSchema = new mongoose.Schema({
  reporter: String,
  targetUsername: String,
  targetFile: String,
  reason: String,
  status: { type: String, default: 'open' },
  timestamp: { type: Date, default: Date.now }
});
const Report = mongoose.model('Report', reportSchema);

const announcementSchema = new mongoose.Schema({
  message: String,
  timestamp: { type: Date, default: Date.now }
});
const Announcement = mongoose.model('Announcement', announcementSchema);

const friendRequestSchema = new mongoose.Schema({
  from: String,
  to: String,
  status: { type: String, default: 'pending' },
  timestamp: { type: Date, default: Date.now }
});
const FriendRequest = mongoose.model('FriendRequest', friendRequestSchema);

const directMessageSchema = new mongoose.Schema({
  from: String,
  to: String,
  text: String,
  sharedFile: String,
  timestamp: { type: Date, default: Date.now }
});
const DirectMessage = mongoose.model('DirectMessage', directMessageSchema);

// ---------- Mailjet ----------
const mailjet = Mailjet.apiConnect(process.env.MAILJET_API_KEY, process.env.MAILJET_SECRET_KEY);
async function sendEmail(toEmail, subject, html) {
  return mailjet.post('send', { version: 'v3.1' }).request({
    Messages: [{
      From: { Email: process.env.MAILJET_SENDER_EMAIL, Name: 'Jisan Server' },
      To: [{ Email: toEmail }],
      Subject: subject,
      HTMLPart: html
    }]
  });
}

const DATA_DIR = path.join(__dirname, 'my-files');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-to-something-random-and-long',
  resave: false,
  saveUninitialized: false
}));

// ---------- Shared styles ----------
function sharedStyles() {
  return `
    * { box-sizing: border-box; }
    html, body { margin:0; min-height:100%; font-family:'Segoe UI', Roboto, Arial, sans-serif; color:#f1f5f9; overflow-x:hidden; }
    body { position:relative; min-height:100vh; padding:40px 20px;
      background: linear-gradient(-45deg, #0b1120, #1e1b4b, #0c4a6e, #1e293b, #3b0764);
      background-size: 400% 400%; animation: gradientMove 22s ease infinite; }
    @keyframes gradientMove { 0%{background-position:0% 50%;} 50%{background-position:100% 50%;} 100%{background-position:0% 50%;} }
    .bg-orb { position:fixed; border-radius:50%; filter:blur(70px); opacity:0.28; z-index:0; animation: floatOrb 14s ease-in-out infinite; }
    .orb1 { width:360px; height:360px; background:#38bdf8; top:-80px; left:-80px; animation-duration:16s; }
    .orb2 { width:300px; height:300px; background:#a855f7; bottom:-80px; right:-60px; animation-duration:18s; animation-delay:2s; }
    .orb3 { width:220px; height:220px; background:#f472b6; top:45%; right:8%; animation-duration:22s; animation-delay:4s; }
    @keyframes floatOrb { 0%,100%{transform:translateY(0) translateX(0);} 50%{transform:translateY(-30px) translateX(24px);} }
    .card { position:relative; z-index:1; background: rgba(30,41,59,0.68); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
      border-radius:20px; padding:34px 38px; box-shadow: 0 24px 70px rgba(0,0,0,0.55); border:1px solid rgba(148,163,184,0.18); }
    .brand { display:flex; align-items:center; gap:10px; margin-bottom:18px; }
    .brand-dot { width:12px; height:12px; border-radius:50%; background:#38bdf8; box-shadow:0 0 14px #38bdf8; }
    .brand-name { font-weight:800; letter-spacing:0.8px; background:linear-gradient(90deg,#38bdf8,#a855f7); -webkit-background-clip:text; background-clip:text; color:transparent; font-size:16px; }
    h1 { font-size:22px; margin-top:0; color:#e2e8f0; }
    h3 { color:#93c5fd; margin-bottom:8px; }
    a { color:#38bdf8; text-decoration:none; }
    a:hover { text-decoration:underline; }
    input, select, button, textarea { width:100%; padding:12px 14px; margin:6px 0 14px 0; border-radius:12px;
      border:1px solid #334155; background: rgba(15,23,42,0.8); color:#f1f5f9; font-size:14px; font-family:inherit; }
    input:focus, select:focus, textarea:focus { outline:none; border-color:#38bdf8; box-shadow:0 0 0 3px rgba(56,189,248,0.15); }
    button { background: linear-gradient(135deg, #38bdf8, #6366f1); color:#0b1120; font-weight:700; border:none; cursor:pointer; transition:0.2s; }
    button:hover { filter:brightness(1.12); transform:translateY(-1px); }
    .btn-danger { background: linear-gradient(135deg, #f87171, #dc2626) !important; color:#fff !important; }
    .btn-ghost { background: rgba(51,65,85,0.6) !important; color:#e2e8f0 !important; border:1px solid rgba(148,163,184,0.25) !important; }
    .small-link { font-size:13px; color:#94a3b8; }
    .hint-text { font-size:12px; color:#fbbf24; margin:-8px 0 12px 2px; }
    .pw-wrapper { position:relative; }
    .pw-wrapper input { padding-right:42px; }
    .pw-toggle { position:absolute; right:10px; top:8px; cursor:pointer; background:none !important; border:none; width:auto; padding:0; margin:0; font-size:16px; color:#94a3b8; }
    .grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap:16px; }
    .file-card { background: rgba(15,23,42,0.85); border:1px solid #334155; border-radius:14px; padding:0; text-align:center; transition:0.2s; overflow:hidden; position:relative; }
    .file-card:hover { border-color:#38bdf8; transform: translateY(-3px); }
    .thumb-wrap { position:relative; width:100%; height:130px; background:#1e293b; overflow:hidden; }
    .thumb { width:100%; height:130px; object-fit:cover; display:block; }
    .filetype { display:flex; align-items:center; justify-content:center; height:130px; color:#94a3b8; font-weight:700; font-size:13px; background:#1e293b; }
    .card-overlay { position:absolute; inset:0; background: linear-gradient(to top, rgba(0,0,0,0.8), transparent 55%);
      display:flex; align-items:flex-end; justify-content:flex-end; padding:8px; opacity:0; transition:0.2s; gap:4px; flex-wrap:wrap; }
    .file-card:hover .card-overlay { opacity:1; }
    .overlay-btn { width:auto; padding:6px 9px; margin:0; font-size:11px; border-radius:8px; text-decoration:none; }
    .filename { font-size:12px; color:#cbd5e1; margin:8px 10px 10px 10px; word-break:break-word; }
    .folder-card { background: rgba(15,23,42,0.7); border:1px solid #334155; border-radius:16px; padding:20px; text-align:center; transition:0.2s; display:block; }
    .folder-card:hover { border-color:#a855f7; transform: translateY(-3px); text-decoration:none; }
    .folder-icon { font-size:34px; margin-bottom:8px; }
    .folder-name { font-size:14px; color:#e2e8f0; font-weight:600; word-break:break-word; }
    .settings-row { display:flex; justify-content:space-between; align-items:center; padding:14px 0; border-bottom:1px solid rgba(148,163,184,0.12); gap:12px; flex-wrap:wrap; }
    .settings-row:last-child { border-bottom:none; }
    .announcement-banner { background: linear-gradient(135deg, rgba(251,191,36,0.15), rgba(251,191,36,0.05)); border:1px solid rgba(251,191,36,0.4); border-radius:14px; padding:14px 18px; margin-bottom:20px; font-size:14px; color:#fde68a; }
    .msg-bubble { max-width:75%; padding:10px 14px; border-radius:14px; margin-bottom:8px; font-size:14px; }
    .msg-mine { background: linear-gradient(135deg,#38bdf8,#6366f1); color:#0b1120; margin-left:auto; }
    .msg-theirs { background: rgba(51,65,85,0.7); color:#e2e8f0; }
    .msg-list { display:flex; flex-direction:column; max-height:400px; overflow-y:auto; padding:10px; }
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

function authPage(title, body) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} — Jisan Server</title>
  <style>${sharedStyles()} body.auth { display:flex; justify-content:center; align-items:center; } .auth-card { max-width: 430px; width: 100%; }</style></head>
  <body class="auth">
    <div class="bg-orb orb1"></div><div class="bg-orb orb2"></div><div class="bg-orb orb3"></div>
    <div class="card auth-card">
      <div class="brand"><span class="brand-dot"></span><span class="brand-name">JISAN SERVER</span></div>
      ${body}
    </div>
    ${clientScript()}
  </body></html>`;
}

function appPage(title, username, activeKey, folders, mainContent, announcementHtml) {
  const sidebarLinks = folders.map(f => `
    <a href="/folder/${encodeURIComponent(f)}" class="side-link ${activeKey === 'folder:' + f ? 'active' : ''}">
      <span class="side-icon">📁</span> ${f}
    </a>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} — Jisan Server</title>
  <style>${sharedStyles()}
    body.dash { display:block; padding:0; align-items:initial; justify-content:initial; }
    .shell { position:relative; z-index:1; display:flex; min-height:100vh; }
    .sidebar { width: 260px; flex-shrink:0; background: rgba(15,23,42,0.75); backdrop-filter: blur(16px);
      border-right: 1px solid rgba(148,163,184,0.15); padding: 24px 18px; display:flex; flex-direction:column; gap: 18px; overflow-y:auto; }
    .side-nav { display:flex; flex-direction:column; gap:4px; }
    .side-link { display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:10px; color:#cbd5e1; font-size:14px; text-decoration:none; transition:0.15s; }
    .side-link:hover { background: rgba(56,189,248,0.1); color:#e2e8f0; text-decoration:none; }
    .side-link.active { background: linear-gradient(135deg, rgba(56,189,248,0.25), rgba(99,102,241,0.25)); color:#7dd3fc; font-weight:600; }
    .side-section-title { font-size:11px; text-transform:uppercase; letter-spacing:1px; color:#64748b; margin: 10px 0 2px 4px; }
    .user-chip { display:flex; align-items:center; gap:10px; padding:10px 12px; background:rgba(30,41,59,0.6); border-radius:12px; border:1px solid rgba(148,163,184,0.15); }
    .avatar { width:34px; height:34px; border-radius:50%; background:linear-gradient(135deg,#38bdf8,#6366f1); display:flex; align-items:center; justify-content:center; font-weight:700; color:#0f172a; flex-shrink:0; }
    .avatar-lg { width:64px; height:64px; font-size:24px; }
    .main { flex:1; padding: 28px 34px; min-width:0; }
    .breadcrumb { font-size:13px; color:#94a3b8; margin-bottom:6px; }
    .page-title { font-size:26px; font-weight:700; margin: 0 0 6px 0; color:#f1f5f9; }
    .toolbar { display:flex; gap:12px; margin-bottom:10px; flex-wrap:wrap; align-items:center; }
    .toolbar form { display:flex; gap:8px; align-items:center; margin:0; flex-wrap:wrap; }
    .toolbar input, .toolbar select { margin:0; width:auto; min-width:160px; }
    .toolbar button { margin:0; width:auto; padding:10px 18px; }
    .empty-state { text-align:center; padding: 60px 20px; color:#64748b; }
    .empty-state .emoji { font-size:42px; margin-bottom:10px; }
    .profile-header { display:flex; align-items:center; gap:18px; padding:22px 26px; background: rgba(15,23,42,0.6); border:1px solid rgba(148,163,184,0.15); border-radius:18px; margin-bottom:20px; }
    .profile-stats { display:flex; gap:26px; margin-top:6px; font-size:13px; color:#94a3b8; }
    .profile-stats b { color:#e2e8f0; }
    @media (max-width: 800px) { .shell { flex-direction:column; } .sidebar { width:100%; flex-direction:row; overflow-x:auto; align-items:center; } .side-nav { flex-direction:row; } .main { padding: 20px; } .profile-header { flex-direction:column; text-align:center; } }
  </style></head>
  <body class="dash">
    <div class="bg-orb orb1"></div><div class="bg-orb orb2"></div><div class="bg-orb orb3"></div>
    <div class="shell">
      <aside class="sidebar">
        <div class="brand"><span class="brand-dot"></span><span class="brand-name">JISAN SERVER</span></div>
        <div class="user-chip">
          <div class="avatar">${username.charAt(0).toUpperCase()}</div>
          <div><div style="font-size:13px; font-weight:600; color:#e2e8f0;">${username}</div>
          <div style="font-size:11px; color:#64748b;"><a href="/logout">Log out</a></div></div>
        </div>
        <div>
          <div class="side-section-title">Overview</div>
          <div class="side-nav">
            <a href="/" class="side-link ${activeKey === 'home' ? 'active' : ''}">🏠 Dashboard</a>
            <a href="/friends" class="side-link ${activeKey === 'friends' ? 'active' : ''}">👥 Friends</a>
            <a href="/messages" class="side-link ${activeKey === 'messages' ? 'active' : ''}">💬 Messages</a>
            <a href="/support" class="side-link ${activeKey === 'support' ? 'active' : ''}">🆘 Help & Support</a>
            <a href="/settings" class="side-link ${activeKey === 'settings' ? 'active' : ''}">⚙️ Settings</a>
          </div>
        </div>
        <div>
          <div class="side-section-title">Your Folders</div>
          <div class="side-nav">${sidebarLinks || '<span style="color:#475569; font-size:13px; padding:6px 12px;">No folders yet</span>'}</div>
        </div>
      </aside>
      <main class="main">
        ${announcementHtml || ''}
        ${mainContent}
      </main>
    </div>
    ${clientScript()}
  </body></html>`;
}

// ---------- Helpers ----------
function requireLogin(req, res, next) {
  if (!req.session.username) return res.redirect('/login');
  next();
}
function requireSecretAdmin(req, res, next) {
  if (!req.session.isSecretAdmin) return res.redirect('/admin/login');
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
function countAllFiles(username) {
  const folders = getFolders(username);
  let count = 0;
  folders.forEach(f => { count += fs.readdirSync(path.join(userDir(username), f)).length; });
  return count;
}
async function getAnnouncementHtml() {
  const latest = await Announcement.findOne().sort({ timestamp: -1 });
  if (!latest) return '';
  return `<div class="announcement-banner">📢 <b>Notice from admin:</b> ${latest.message}</div>`;
}

// ---------- Register ----------
app.get('/register', (req, res) => {
  res.send(authPage('Register', `
    <h1>Create your account</h1>
    <form method="post" action="/register">
      <input name="username" placeholder="Choose a username" required />
      <input name="email" type="email" placeholder="Your email address" required />
      <p class="hint-text">📩 The verification email may land in your Spam / Junk folder.</p>
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
  try {
    const { username, email, password, securityQuestion, securityAnswer } = req.body;
    const clean = (username || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!clean || !cleanEmail || !password || !securityQuestion || !securityAnswer) {
      return res.send('All fields are required. <a href="/register">Back</a>');
    }
    if (await User.findOne({ username: clean })) return res.send('Username already taken. <a href="/register">Back</a>');
    if (await User.findOne({ email: cleanEmail })) return res.send('Email already registered. <a href="/register">Back</a>');

    const hash = await bcrypt.hash(password, 10);
    const answerHash = await bcrypt.hash(securityAnswer.trim().toLowerCase(), 10);
    const verifyToken = crypto.randomBytes(24).toString('hex');

    await new User({ username: clean, email: cleanEmail, password: hash, securityQuestion: securityQuestion.trim(), securityAnswer: answerHash, verified: false, verifyToken }).save();
    userDir(clean);

    const verifyLink = `${BASE_URL}/verify-email?token=${verifyToken}`;
    try {
      await sendEmail(cleanEmail, 'Verify your Jisan Server account', `<p>Hi ${clean},</p><p>Click below to verify your account:</p><p><a href="${verifyLink}">${verifyLink}</a></p>`);
    } catch (err) {
      console.error('Email send failed:', err.message);
      return res.send(`Account created, but the verification email failed to send (${err.message}). <a href="/resend-verification">Try resending</a>`);
    }

    res.send(authPage('Check your email', `<h1>Verify your email</h1><p>We sent a link to <strong>${cleanEmail}</strong>.</p><p class="hint-text">📩 Check your Spam / Junk folder too.</p><p><a href="/login">Back to login</a></p>`));
  } catch (err) {
    console.error('Register error:', err.message);
    res.send('Something went wrong during registration. <a href="/register">Try again</a>');
  }
});

app.get('/verify-email', async (req, res) => {
  const user = await User.findOne({ verifyToken: req.query.token });
  if (!user) return res.send('Invalid or expired verification link. <a href="/login">Back to login</a>');
  user.verified = true;
  user.verifyToken = undefined;
  await user.save();
  res.send(authPage('Verified', `<h1>Email verified!</h1><p><a href="/login">Log in now</a></p>`));
});

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
  const user = await User.findOne({ username: clean });
  if (!user) return res.send('No account found. <a href="/resend-verification">Try again</a>');
  if (user.verified) return res.send('Already verified. <a href="/login">Log in</a>');
  const newToken = crypto.randomBytes(24).toString('hex');
  user.verifyToken = newToken;
  await user.save();
  const verifyLink = `${BASE_URL}/verify-email?token=${newToken}`;
  try {
    await sendEmail(user.email, 'Verify your account (resent)', `<p>Hi ${user.username},</p><p><a href="${verifyLink}">${verifyLink}</a></p>`);
  } catch (err) {
    return res.send(`Failed: ${err.message} <a href="/resend-verification">Try again</a>`);
  }
  res.send(authPage('Email resent', `<h1>Sent!</h1><p>Check ${user.email}.</p><p><a href="/login">Back</a></p>`));
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
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'] || 'unknown device';

  const user = await User.findOne({ username: clean });
  if (!user) {
    await LoginAttempt.create({ username: clean, success: false, ip, userAgent });
    return res.send('Wrong username or password. <a href="/login">Try again</a>');
  }
  if (user.banned) {
    await LoginAttempt.create({ username: clean, success: false, ip, userAgent });
    return res.send(`Your account has been banned.${user.banReason ? ' Reason: ' + user.banReason : ''} <a href="/login">Back</a>`);
  }
  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    await LoginAttempt.create({ username: clean, success: false, ip, userAgent });
    return res.send('Wrong username or password. <a href="/login">Try again</a>');
  }
  if (!user.verified) return res.send('Please verify your email first. <a href="/resend-verification">Resend email</a>');

  await LoginAttempt.create({ username: clean, success: true, ip, userAgent });
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
app.get('/forgot-password/question', async (req, res) => {
  const user = await User.findOne({ username: (req.query.username || '').trim().toLowerCase() });
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
  `));
});
app.post('/forgot-password/reset', async (req, res) => {
  const { username, answer, newPassword } = req.body;
  const user = await User.findOne({ username: (username || '').trim().toLowerCase() });
  if (!user) return res.send('Account not found. <a href="/forgot-password">Try again</a>');
  if (!(await bcrypt.compare((answer || '').trim().toLowerCase(), user.securityAnswer))) return res.send('Incorrect answer. <a href="/forgot-password">Try again</a>');
  if (!newPassword || newPassword.length < 3) return res.send('Password too short. <a href="/forgot-password">Try again</a>');
  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();
  res.send('Password reset! <a href="/login">Log in now</a>');
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

function fileCardHtml(username, folder, f, isOwner) {
  const ext = path.extname(f).toLowerCase();
  const url = `/files/${username}/${folder}/${encodeURIComponent(f)}`;
  let preview = '';
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) preview = `<img src="${url}" class="thumb" loading="lazy" />`;
  else if (['.mp4', '.webm', '.mov'].includes(ext)) preview = `<video src="${url}" class="thumb" muted></video>`;
  else if (ext === '.pdf') preview = `<div class="filetype">📕 PDF</div>`;
  else preview = `<div class="filetype">${ext.replace('.', '').toUpperCase() || 'FILE'}</div>`;

  const isMedia = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.webm', '.mov'].includes(ext);
  const viewLink = (ext === '.pdf' || isMedia) ? `<a href="/view/${username}/${folder}/${encodeURIComponent(f)}" class="overlay-btn" style="background:#38bdf8;color:#0b1120;">Open</a>` : '';
  const deleteBtn = isOwner ? `<form method="post" action="/delete-file" style="margin:0;" onsubmit="return confirm('Delete this file permanently?');">
      <input type="hidden" name="folder" value="${folder}" /><input type="hidden" name="filename" value="${f}" />
      <button type="submit" class="overlay-btn btn-danger" style="width:auto;">🗑</button>
    </form>` : `<form method="post" action="/report" style="margin:0;">
      <input type="hidden" name="targetUsername" value="${username}" /><input type="hidden" name="targetFile" value="${folder}/${f}" />
      <button type="submit" class="overlay-btn btn-ghost" style="width:auto;" onclick="return confirm('Report this file to admin?');">🚩</button>
    </form>`;

  return `<div class="file-card">
    <div class="thumb-wrap">${preview}
      <div class="card-overlay">${viewLink}
        <a href="${url}" download class="overlay-btn btn-ghost">⬇</a>
        ${deleteBtn}
      </div>
    </div>
    <p class="filename">${f}</p>
  </div>`;
}

// ---------- Dashboard ----------
app.get('/', requireLogin, async (req, res) => {
  const username = req.session.username;
  const folders = getFolders(username);
  const folderOptions = folders.map(f => `<option value="${f}">${f}</option>`).join('');
  const fileCount = countAllFiles(username);
  const announcementHtml = await getAnnouncementHtml();

  const folderCards = folders.map(f => `
    <a href="/folder/${encodeURIComponent(f)}" class="folder-card"><div class="folder-icon">📁</div><div class="folder-name">${f}</div></a>`).join('');

  const main = `
    <div class="breadcrumb">Home</div>
    <div class="profile-header">
      <div class="avatar avatar-lg">${username.charAt(0).toUpperCase()}</div>
      <div><h1 class="page-title" style="margin-bottom:2px;">${username}</h1>
        <div class="profile-stats"><span><b>${folders.length}</b> folders</span><span><b>${fileCount}</b> files</span></div>
      </div>
    </div>
    <div class="toolbar">
      <form method="post" action="/create-folder"><input name="foldername" placeholder="New folder name" required /><button type="submit">+ Create Folder</button></form>
      <form method="post" action="/upload" enctype="multipart/form-data">
        <select name="folder"><option value="general">general</option>${folderOptions}</select>
        <input type="file" name="myfile" required /><button type="submit" class="btn-ghost">Upload File</button>
      </form>
    </div>
    <h3>Your Folders</h3>
    ${folders.length ? `<div class="grid">${folderCards}</div>` : `<div class="empty-state"><div class="emoji">📂</div><p>No folders yet.</p></div>`}
  `;
  res.send(appPage('Dashboard', username, 'home', folders, main, announcementHtml));
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

app.post('/delete-file', requireLogin, (req, res) => {
  const folder = (req.body.folder || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const filename = req.body.filename;
  const filePath = path.join(userDir(req.session.username), folder, filename);
  const base = userDir(req.session.username);
  if (filePath.startsWith(base) && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.redirect(`/folder/${encodeURIComponent(folder)}`);
});

app.get('/folder/:folder', requireLogin, async (req, res) => {
  const username = req.session.username;
  const folders = getFolders(username);
  const folder = req.params.folder;
  const announcementHtml = await getAnnouncementHtml();
  if (!folders.includes(folder)) return res.send(appPage('Not found', username, null, folders, `<div class="empty-state">🚫 Folder not found.</div>`, announcementHtml));

  const files = fs.readdirSync(path.join(userDir(username), folder));
  const cards = files.map(f => fileCardHtml(username, folder, f, true)).join('');
  const main = `
    <div class="breadcrumb"><a href="/">Home</a> / ${folder}</div>
    <h1 class="page-title">${folder}</h1>
    <div class="toolbar"><form method="post" action="/upload" enctype="multipart/form-data">
      <input type="hidden" name="folder" value="${folder}" /><input type="file" name="myfile" required /><button type="submit">Upload here</button>
    </form></div>
    ${files.length ? `<div class="grid">${cards}</div>` : `<div class="empty-state">🗂️ Empty folder.</div>`}
  `;
  res.send(appPage(folder, username, 'folder:' + folder, folders, main, announcementHtml));
});

app.get('/view/:username/:folder/:filename', requireLogin, (req, res) => {
  const { username, folder, filename } = req.params;
  const url = `/files/${username}/${folder}/${encodeURIComponent(filename)}`;
  const ext = path.extname(filename).toLowerCase();
  let viewer = `<iframe src="${url}" style="width:100%; height:80vh; border:none; border-radius:16px;"></iframe>`;
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) viewer = `<img src="${url}" style="width:100%; border-radius:16px;" />`;
  else if (['.mp4', '.webm', '.mov'].includes(ext)) viewer = `<video src="${url}" controls style="width:100%; border-radius:16px;"></video>`;

  const main = `<div class="breadcrumb"><a href="/">Home</a> / ${filename}</div><h1 class="page-title">${filename}</h1><div class="card" style="padding:0; overflow:hidden;">${viewer}</div>`;
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>${filename}</title><style>${sharedStyles()}</style></head><body class="dash"><main class="main">${main}</main></body></html>`);
});

app.get('/files/:username/:folder/:filename', requireLogin, async (req, res) => {
  const { username, folder, filename } = req.params;
  const requester = req.session.username;
  const base = userDir(username);
  const filePath = path.join(base, folder, filename);
  if (!filePath.startsWith(base) || !fs.existsSync(filePath)) return res.status(404).send('Not found');

  if (requester === username) return res.sendFile(filePath);

  const sharedPath = `${folder}/${filename}`;
  const wasShared = await DirectMessage.findOne({ from: username, to: requester, sharedFile: sharedPath });
  if (wasShared) return res.sendFile(filePath);

  return res.status(403).send('Forbidden');
});

app.post('/report', requireLogin, async (req, res) => {
  const { targetUsername, targetFile } = req.body;
  await Report.create({ reporter: req.session.username, targetUsername, targetFile: targetFile || '', reason: 'User flagged this content' });
  res.send('Reported to admin for review. Thank you. <a href="javascript:history.back()">Go back</a>');
});

// ---------- Friends ----------
app.get('/friends', requireLogin, async (req, res) => {
  const username = req.session.username;
  const folders = getFolders(username);
  const announcementHtml = await getAnnouncementHtml();

  const incoming = await FriendRequest.find({ to: username, status: 'pending' });
  const accepted = await FriendRequest.find({ $or: [{ from: username, status: 'accepted' }, { to: username, status: 'accepted' }] });
  const friendNames = accepted.map(f => f.from === username ? f.to : f.from);

  const incomingHtml = incoming.map(r => `
    <div class="settings-row"><span>${r.from} wants to be friends</span>
      <span>
        <form method="post" action="/friends/respond" style="display:inline;">
          <input type="hidden" name="id" value="${r._id}" /><input type="hidden" name="action" value="accept" />
          <button type="submit" style="width:auto; padding:6px 12px;">Accept</button>
        </form>
        <form method="post" action="/friends/respond" style="display:inline;">
          <input type="hidden" name="id" value="${r._id}" /><input type="hidden" name="action" value="decline" />
          <button type="submit" class="btn-ghost" style="width:auto; padding:6px 12px;">Decline</button>
        </form>
      </span>
    </div>`).join('');

  const friendsHtml = friendNames.map(f => `<div class="settings-row"><span>👤 ${f}</span><a href="/messages/${f}">Message →</a></div>`).join('');

  const main = `
    <div class="breadcrumb">Home / Friends</div>
    <h1 class="page-title">Friends</h1>
    <div class="card" style="max-width:600px; padding:24px 28px;">
      <h3>Add a friend</h3>
      <form method="post" action="/friends/request">
        <input name="to" placeholder="Enter their username" required />
        <button type="submit">Send Friend Request</button>
      </form>
    </div>
    ${incoming.length ? `<h3 style="margin-top:22px;">Pending requests</h3><div class="card" style="max-width:600px; padding:12px 28px;">${incomingHtml}</div>` : ''}
    <h3 style="margin-top:22px;">Your Friends</h3>
    <div class="card" style="max-width:600px; padding:12px 28px;">${friendsHtml || '<p class="small-link">No friends yet.</p>'}</div>
  `;
  res.send(appPage('Friends', username, 'friends', folders, main, announcementHtml));
});

app.post('/friends/request', requireLogin, async (req, res) => {
  const from = req.session.username;
  const to = (req.body.to || '').trim().toLowerCase();
  if (to === from) return res.send('You cannot friend yourself. <a href="/friends">Back</a>');
  const targetUser = await User.findOne({ username: to });
  if (!targetUser) return res.send('User not found. <a href="/friends">Back</a>');
  const existing = await FriendRequest.findOne({ $or: [{ from, to }, { from: to, to: from }] });
  if (existing) return res.send('A request already exists between you two. <a href="/friends">Back</a>');
  await FriendRequest.create({ from, to });
  res.redirect('/friends');
});

app.post('/friends/respond', requireLogin, async (req, res) => {
  const { id, action } = req.body;
  const request = await FriendRequest.findById(id);
  if (request && request.to === req.session.username) {
    request.status = action === 'accept' ? 'accepted' : 'declined';
    await request.save();
  }
  res.redirect('/friends');
});

// ---------- Messages ----------
app.get('/messages', requireLogin, async (req, res) => {
  const username = req.session.username;
  const folders = getFolders(username);
  const announcementHtml = await getAnnouncementHtml();

  const accepted = await FriendRequest.find({ $or: [{ from: username, status: 'accepted' }, { to: username, status: 'accepted' }] });
  const friendNames = accepted.map(f => f.from === username ? f.to : f.from);
  const list = friendNames.map(f => `<div class="settings-row"><span>👤 ${f}</span><a href="/messages/${f}">Open chat →</a></div>`).join('');

  const main = `
    <div class="breadcrumb">Home / Messages</div>
    <h1 class="page-title">Messages</h1>
    <div class="card" style="max-width:600px; padding:12px 28px;">${list || '<p class="small-link">Add friends first to start messaging.</p>'}</div>
  `;
  res.send(appPage('Messages', username, 'messages', folders, main, announcementHtml));
});

app.get('/messages/:friend', requireLogin, async (req, res) => {
  const username = req.session.username;
  const friend = req.params.friend;
  const folders = getFolders(username);
  const announcementHtml = await getAnnouncementHtml();

  const isFriend = await FriendRequest.findOne({ status: 'accepted', $or: [{ from: username, to: friend }, { from: friend, to: username }] });
  if (!isFriend) return res.send(appPage('Chat', username, 'messages', folders, `<div class="empty-state">You are not friends with ${friend} yet.</div>`, announcementHtml));

  const msgs = await DirectMessage.find({ $or: [{ from: username, to: friend }, { from: friend, to: username }] }).sort({ timestamp: 1 });
  const msgsHtml = msgs.map(m => `
    <div class="msg-bubble ${m.from === username ? 'msg-mine' : 'msg-theirs'}">
      ${m.text ? m.text : ''}
      ${m.sharedFile ? `<br/><a href="/files/${m.from}/${m.sharedFile}" style="color:inherit; text-decoration:underline;">📎 ${m.sharedFile.split('/').pop()}</a>` : ''}
    </div>`).join('');

  const myFolders = getFolders(username);
  const fileOptions = myFolders.flatMap(f => fs.readdirSync(path.join(userDir(username), f)).map(file => `<option value="${f}/${file}">${f}/${file}</option>`)).join('');

  const main = `
    <div class="breadcrumb"><a href="/messages">Messages</a> / ${friend}</div>
    <h1 class="page-title">Chat with ${friend}</h1>
    <div class="card" style="max-width:700px; padding:16px;">
      <div class="msg-list">${msgsHtml || '<p class="small-link">No messages yet.</p>'}</div>
    </div>
    <form method="post" action="/messages/${friend}/send" style="max-width:700px; margin-top:12px;">
      <input name="text" placeholder="Type a message..." />
      <select name="sharedFile"><option value="">— optionally share a file —</option>${fileOptions}</select>
      <button type="submit">Send</button>
    </form>
  `;
  res.send(appPage('Chat', username, 'messages', folders, main, announcementHtml));
});

app.post('/messages/:friend/send', requireLogin, async (req, res) => {
  const username = req.session.username;
  const friend = req.params.friend;
  const isFriend = await FriendRequest.findOne({ status: 'accepted', $or: [{ from: username, to: friend }, { from: friend, to: username }] });
  if (!isFriend) return res.redirect('/messages');
  const { text, sharedFile } = req.body;
  if (!text && !sharedFile) return res.redirect(`/messages/${friend}`);
  await DirectMessage.create({ from: username, to: friend, text: text || '', sharedFile: sharedFile || undefined });
  res.redirect(`/messages/${friend}`);
});

// ---------- Help & Support ----------
app.get('/support', requireLogin, async (req, res) => {
  const username = req.session.username;
  const folders = getFolders(username);
  const announcementHtml = await getAnnouncementHtml();

  const msgs = await SupportMessage.find({ username }).sort({ timestamp: 1 });
  const msgsHtml = msgs.map(m => `<div class="msg-bubble ${m.fromAdmin ? 'msg-theirs' : 'msg-mine'}">${m.fromAdmin ? '🛡️ Admin: ' : ''}${m.message}</div>`).join('');

  const main = `
    <div class="breadcrumb">Home / Help & Support</div>
    <h1 class="page-title">Help & Support</h1>
    <div class="card" style="max-width:700px; padding:16px;"><div class="msg-list">${msgsHtml || '<p class="small-link">No messages yet — send one below.</p>'}</div></div>
    <form method="post" action="/support/send" style="max-width:700px; margin-top:12px;">
      <textarea name="message" rows="3" placeholder="Describe your issue..." required></textarea>
      <button type="submit">Send to Admin</button>
    </form>
  `;
  res.send(appPage('Support', username, 'support', folders, main, announcementHtml));
});

app.post('/support/send', requireLogin, async (req, res) => {
  await SupportMessage.create({ username: req.session.username, message: req.body.message, fromAdmin: false });
  res.redirect('/support');
});

// ---------- Settings ----------
app.get('/settings', requireLogin, async (req, res) => {
  const username = req.session.username;
  const folders = getFolders(username);
  const user = await User.findOne({ username });
  const announcementHtml = await getAnnouncementHtml();
  const attempts = await LoginAttempt.find({ username }).sort({ timestamp: -1 }).limit(10);
  const attemptsHtml = attempts.map(a => `
    <div class="settings-row"><span>${a.success ? '✅' : '❌'} ${a.ip || 'unknown IP'} — ${(a.userAgent || '').slice(0, 40)}</span><b>${new Date(a.timestamp).toLocaleString()}</b></div>`).join('');

  const main = `
    <div class="breadcrumb">Home / Settings</div>
    <h1 class="page-title">Advanced Settings</h1>
    <div class="card" style="max-width:600px; padding:24px 28px;">
      <div class="settings-row"><span>Username</span><b>${user.username}</b></div>
      <div class="settings-row"><span>Email</span><b>${user.email}</b></div>
      <div class="settings-row"><span>Account status</span><b>${user.verified ? '✅ Verified' : '⏳ Not verified'}</b></div>
      <div class="settings-row"><span>Total folders</span><b>${folders.length}</b></div>
      <div class="settings-row"><span>Total files</span><b>${countAllFiles(username)}</b></div>
    </div>
    <h3 style="margin-top:26px;">Recent Login Attempts (Devices)</h3>
    <div class="card" style="max-width:600px; padding:12px 28px;">${attemptsHtml || '<p class="small-link">No attempts yet.</p>'}</div>
    <h3 style="margin-top:26px;">Change Password</h3>
    <div class="card" style="max-width:600px; padding:24px 28px;"><a href="/forgot-password">Go to password reset →</a></div>
    <h3 style="margin-top:26px; color:#f87171;">Danger Zone</h3>
    <div class="card" style="max-width:600px; padding:24px 28px;">
      <form method="post" action="/delete-account" onsubmit="return confirm('This will permanently delete your account and all your files. Continue?');">
        <button type="submit" class="btn-danger">Delete My Account</button>
      </form>
    </div>
  `;
  res.send(appPage('Settings', username, 'settings', folders, main, announcementHtml));
});

app.post('/delete-account', requireLogin, async (req, res) => {
  const username = req.session.username;
  await User.deleteOne({ username });
  const dir = userDir(username);
  fs.rmSync(dir, { recursive: true, force: true });
  req.session.destroy(() => res.redirect('/register'));
});

// ---------- SECRET Admin Login ----------
app.get('/admin/login', (req, res) => {
  res.send(authPage('Admin Login', `
    <h1>🛡️ Server Admin Access</h1>
    <form method="post" action="/admin/login">
      <input name="username" placeholder="Admin username" required />
      <div class="pw-wrapper">
        <input id="admin-pw" name="password" type="password" placeholder="Admin password" required />
        <button type="button" id="admin-pw-eye" class="pw-toggle" onclick="togglePassword('admin-pw')">👁️</button>
      </div>
      <button type="submit">Log In</button>
    </form>
  `));
});

app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    req.session.isSecretAdmin = true;
    return res.redirect('/admin');
  }
  res.send('Wrong admin credentials. <a href="/admin/login">Try again</a>');
});

app.get('/admin/logout', (req, res) => {
  req.session.isSecretAdmin = false;
  res.redirect('/admin/login');
});

// ---------- Admin Panel ----------
app.get('/admin', requireSecretAdmin, async (req, res) => {
  const allUsers = await User.find().sort({ username: 1 });
  const recentAttempts = await LoginAttempt.find().sort({ timestamp: -1 }).limit(50);
  const openReports = await Report.find({ status: 'open' }).sort({ timestamp: -1 });
  const supportThreads = await SupportMessage.distinct('username');

  const usersHtml = allUsers.map(u => `
    <div class="settings-row">
      <span>${u.username} (${u.email}) ${u.banned ? '🚫 banned' : ''}</span>
      <form method="post" action="/admin/ban" style="display:inline;">
        <input type="hidden" name="username" value="${u.username}" />
        <input type="hidden" name="action" value="${u.banned ? 'unban' : 'ban'}" />
        <button type="submit" class="${u.banned ? '' : 'btn-danger'}" style="width:auto; padding:6px 12px;">${u.banned ? 'Unban' : 'Ban'}</button>
      </form>
    </div>`).join('');

  const attemptsHtml = recentAttempts.map(a => `
    <div class="settings-row"><span>${a.success ? '✅' : '❌'} ${a.username} — ${a.ip} — ${(a.userAgent || '').slice(0, 60)}</span><b>${new Date(a.timestamp).toLocaleString()}</b></div>`).join('');

  const reportsHtml = openReports.map(r => `
    <div class="settings-row"><span>🚩 ${r.reporter} reported ${r.targetUsername}${r.targetFile ? ' (' + r.targetFile + ')' : ''}</span>
      <form method="post" action="/admin/report-resolve" style="display:inline;">
        <input type="hidden" name="id" value="${r._id}" />
        <button type="submit" style="width:auto; padding:6px 12px;">Mark Reviewed</button>
      </form></div>`).join('');

  const supportHtml = supportThreads.map(u => `<div class="settings-row"><span>💬 ${u}</span><a href="/admin/support/${u}">Open thread →</a></div>`).join('');

  const body = `
    <div class="card" style="max-width:900px; margin: 0 auto;">
      <div class="brand"><span class="brand-dot"></span><span class="brand-name">JISAN SERVER — ADMIN</span></div>
      <div style="text-align:right; margin-bottom:10px;"><a href="/admin/logout">Log out of admin</a></div>

      <h3>Post a Notice to All Users</h3>
      <form method="post" action="/admin/announce">
        <textarea name="message" rows="2" placeholder="Notice text..." required></textarea>
        <button type="submit">Post Notice</button>
      </form>

      <h3 style="margin-top:22px;">Open Reports (${openReports.length})</h3>
      ${reportsHtml || '<p class="small-link">No open reports.</p>'}

      <h3 style="margin-top:22px;">All Users (${allUsers.length})</h3>
      ${usersHtml}

      <h3 style="margin-top:22px;">Login Activity — Devices & IPs</h3>
      ${attemptsHtml || '<p class="small-link">No activity yet.</p>'}

      <h3 style="margin-top:22px;">Support Threads</h3>
      ${supportHtml || '<p class="small-link">None yet.</p>'}
    </div>
  `;

  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Admin — Jisan Server</title><style>${sharedStyles()}</style></head><body>${body}${clientScript()}</body></html>`);
});

app.post('/admin/announce', requireSecretAdmin, async (req, res) => {
  await Announcement.create({ message: req.body.message });
  res.redirect('/admin');
});

app.post('/admin/ban', requireSecretAdmin, async (req, res) => {
  const { username, action } = req.body;
  await User.updateOne({ username }, { banned: action === 'ban' });
  res.redirect('/admin');
});

app.post('/admin/report-resolve', requireSecretAdmin, async (req, res) => {
  await Report.updateOne({ _id: req.body.id }, { status: 'reviewed' });
  res.redirect('/admin');
});

app.get('/admin/support/:username', requireSecretAdmin, async (req, res) => {
  const targetUser = req.params.username;
  const msgs = await SupportMessage.find({ username: targetUser }).sort({ timestamp: 1 });
  const msgsHtml = msgs.map(m => `<div class="msg-bubble ${m.fromAdmin ? 'msg-mine' : 'msg-theirs'}">${m.fromAdmin ? 'You: ' : targetUser + ': '}${m.message}</div>`).join('');

  const body = `
    <div class="card" style="max-width:700px; margin:0 auto;">
      <div class="brand"><span class="brand-dot"></span><span class="brand-name">JISAN SERVER — ADMIN</span></div>
      <div class="breadcrumb"><a href="/admin">Admin</a> / Support: ${targetUser}</div>
      <h1 class="page-title">Support thread with ${targetUser}</h1>
      <div class="msg-list">${msgsHtml}</div>
      <form method="post" action="/admin/support/${targetUser}/reply">
        <input name="message" placeholder="Type your reply..." required />
        <button type="submit">Reply</button>
      </form>
    </div>`;
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Support — Admin</title><style>${sharedStyles()}</style></head><body>${body}${clientScript()}</body></html>`);
});

app.post('/admin/support/:username/reply', requireSecretAdmin, async (req, res) => {
  await SupportMessage.create({ username: req.params.username, message: req.body.message, fromAdmin: true });
  res.redirect(`/admin/support/${req.params.username}`);
});

app.listen(PORT, () => { console.log(`Jisan Server running at ${BASE_URL}`); });