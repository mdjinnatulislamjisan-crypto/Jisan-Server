const express = require('express');
const multer = require('multer');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const mongoose = require('mongoose');
const Mailjet = require('node-mailjet');
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
});

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// ---------- MongoDB connection ----------
let gridBucket;
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('MongoDB connected');
    gridBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
  })
  .catch(err => console.error('MongoDB connection error:', err.message));

const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  securityQuestion: String,
  securityAnswer: String,
  verified: { type: Boolean, default: false },
  verifyToken: String,
  banned: { type: Boolean, default: false }
});
const loginAttemptSchema = new mongoose.Schema({
  username: String,
  success: Boolean,
  ip: String,
  timestamp: { type: Date, default: Date.now }
});
// Files are stored in MongoDB itself (GridFS) so they survive redeploys,
// the same way your accounts already do — Render's disk is wiped on every deploy, MongoDB isn't.
const fileMetaSchema = new mongoose.Schema({
  username: { type: String, required: true, index: true },
  folder: { type: String, required: true },
  filename: { type: String, required: true },
  originalName: { type: String, required: true },
  contentType: String,
  size: Number,
  gridId: { type: mongoose.Schema.Types.ObjectId, required: true },
  uploadedAt: { type: Date, default: Date.now }
});
const folderSchema = new mongoose.Schema({
  username: { type: String, required: true, index: true },
  name: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});
folderSchema.index({ username: 1, name: 1 }, { unique: true });

const LoginAttempt = mongoose.model('LoginAttempt', loginAttemptSchema);
const User = mongoose.model('User', userSchema);
const FileMeta = mongoose.model('FileMeta', fileMetaSchema);
const Folder = mongoose.model('Folder', folderSchema);

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
    .hint-text { font-size:12px; color:#fbbf24; margin:-8px 0 12px 2px; }
    .pw-wrapper { position:relative; }
    .pw-wrapper input { padding-right:42px; }
    .pw-toggle { position:absolute; right:10px; top:8px; cursor:pointer; background:none !important; border:none; width:auto; padding:0; margin:0; font-size:16px; color:#94a3b8; }
    .grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap:16px; }
    .file-card { background: rgba(15,23,42,0.85); border:1px solid #334155; border-radius:14px; padding:0; text-align:center; transition:0.2s; overflow:hidden; position:relative; }
    .file-card:hover { border-color:#38bdf8; transform: translateY(-3px); box-shadow: 0 10px 26px rgba(56,189,248,0.18); }
    .thumb-wrap { position:relative; width:100%; height:130px; background:#1e293b; overflow:hidden; }
    .thumb { width:100%; height:130px; object-fit:cover; display:block; }
    .filetype { display:flex; align-items:center; justify-content:center; height:130px; color:#94a3b8; font-weight:700; font-size:13px; background:#1e293b; }
    .card-overlay {
      position:absolute; inset:0; background: linear-gradient(to top, rgba(0,0,0,0.75), transparent 55%);
      display:flex; align-items:flex-end; justify-content:flex-end; padding:8px; opacity:0; transition:0.2s;
    }
    .file-card:hover .card-overlay { opacity:1; }
    .overlay-btn { width:auto; padding:6px 10px; margin:0 0 0 6px; font-size:11px; border-radius:8px; }
    .filename { font-size:12px; color:#cbd5e1; margin:8px 10px 10px 10px; word-break:break-word; }
    .folder-card { background: rgba(15,23,42,0.7); border:1px solid #334155; border-radius:16px; padding:20px; text-align:center; transition:0.2s; display:block; }
    .folder-card:hover { border-color:#a855f7; transform: translateY(-3px); text-decoration:none; }
    .folder-icon { font-size:34px; margin-bottom:8px; }
    .folder-name { font-size:14px; color:#e2e8f0; font-weight:600; word-break:break-word; }
    .progress-wrap { display:none; margin: 10px 0 18px 0; }
    .progress-bar-bg { width:100%; height:10px; background: rgba(15,23,42,0.9); border-radius:20px; overflow:hidden; border:1px solid #334155; }
    .progress-bar-fill { height:100%; width:0%; background: linear-gradient(90deg,#38bdf8,#6366f1); transition: width 0.15s ease; }
    .progress-label { font-size:12px; color:#93c5fd; margin-top:4px; }
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
    function uploadWithProgress(formId, progressWrapId, barId, labelId) {
      const form = document.getElementById(formId);
      if (!form) return;
      form.addEventListener('submit', function(e) {
        e.preventDefault();
        const wrap = document.getElementById(progressWrapId);
        const bar = document.getElementById(barId);
        const label = document.getElementById(labelId);
        wrap.style.display = 'block';
        bar.style.width = '0%';
        label.textContent = 'Uploading... 0%';
        const xhr = new XMLHttpRequest();
        xhr.open('POST', form.action, true);
        xhr.upload.onprogress = function(evt) {
          if (evt.lengthComputable) {
            const pct = Math.round((evt.loaded / evt.total) * 100);
            bar.style.width = pct + '%';
            label.textContent = 'Uploading... ' + pct + '%';
          }
        };
        xhr.onload = function() {
          if (xhr.status >= 200 && xhr.status < 400) {
            label.textContent = 'Upload complete!';
            bar.style.width = '100%';
            setTimeout(() => { window.location = xhr.responseURL || window.location.href; }, 400);
          } else {
            label.textContent = 'Upload failed.';
          }
        };
        xhr.onerror = function() { label.textContent = 'Upload failed (network error).'; };
        xhr.send(new FormData(form));
      });
    }
  </script>`;
}

// ---------- Logo (inline SVG "JS" mark — used as favicon and brand mark, no image file needed) ----------
function logoSvg(size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;display:block;">
    <defs><linearGradient id="jsLogoGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#38bdf8"/><stop offset="1" stop-color="#a855f7"/>
    </linearGradient></defs>
    <rect width="64" height="64" rx="16" fill="url(#jsLogoGrad)"/>
    <text x="32" y="43" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="800" fill="white" text-anchor="middle">JS</text>
  </svg>`;
}
function faviconTag() {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='%2338bdf8'/><stop offset='1' stop-color='%23a855f7'/></linearGradient></defs><rect width='64' height='64' rx='16' fill='url(%23g)'/><text x='32' y='43' font-family='Arial,Helvetica,sans-serif' font-size='26' font-weight='800' fill='white' text-anchor='middle'>JS</text></svg>`;
  return `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${svg}">`;
}

// ---------- Admin page wrapper ----------
function adminPage(title, body) {
  return `<!DOCTYPE html>
  <html><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} — Jisan Server Admin</title>
  ${faviconTag()}
  <style>${sharedStyles()}
    body.admin { padding:40px 20px; align-items:flex-start; justify-content:center; }
    .admin-wrap { position:relative; z-index:1; max-width: 1000px; width:100%; margin: 0 auto; }
    table.admin-table { width:100%; border-collapse:collapse; font-size:13px; }
    table.admin-table th { text-align:left; padding:10px 12px; color:#94a3b8; font-weight:600; border-bottom:1px solid rgba(148,163,184,0.2); }
    table.admin-table td { padding:10px 12px; border-bottom:1px solid rgba(148,163,184,0.1); vertical-align:middle; }
    .ban-btn { width:auto !important; padding:6px 14px !important; margin:0 !important; font-size:12px !important; border-radius:8px !important; }
    .ban-btn.unban { background: linear-gradient(135deg,#22c55e,#16a34a) !important; }
    .ban-btn.ban { background: linear-gradient(135deg,#ef4444,#b91c1c) !important; }
  </style></head>
  <body class="admin">
    <div class="bg-orb orb1"></div><div class="bg-orb orb2"></div><div class="bg-orb orb3"></div>
    <div class="admin-wrap">
      <div class="brand">${logoSvg(30)}<span class="brand-name">JISAN SERVER · ADMIN</span></div>
      ${body}
    </div>
    ${clientScript()}
  </body></html>`;
}

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
  <title>${title} — Jisan Server</title>
  ${faviconTag()}
  <style>${sharedStyles()}
    body.auth { display:flex; justify-content:center; align-items:center; }
    .auth-card { max-width: 430px; width: 100%; }
  </style></head>
  <body class="auth">
    <div class="study-bg">${floating}</div>
    <div class="bg-orb orb1"></div><div class="bg-orb orb2"></div><div class="bg-orb orb3"></div>
    <div class="card auth-card">
      <div class="brand">${logoSvg(30)}<span class="brand-name">JISAN SERVER</span></div>
      ${body}
    </div>
    ${clientScript()}
  </body></html>`;
}

// ---------- App-shell wrapper ----------
function appPage(title, username, activeKey, folders, mainContent) {
  const sidebarLinks = folders.map(f => `
    <a href="/folder/${encodeURIComponent(f)}" class="side-link ${activeKey === 'folder:' + f ? 'active' : ''}">
      <span class="side-icon">📁</span> ${f}
    </a>`).join('');

  return `<!DOCTYPE html>
  <html><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} — Jisan Server</title>
  ${faviconTag()}
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
    .avatar { width:34px; height:34px; border-radius:50%; background:linear-gradient(135deg,#38bdf8,#6366f1); display:flex; align-items:center; justify-content:center; font-weight:700; color:#0f172a; flex-shrink:0; }
    .avatar-lg { width:64px; height:64px; font-size:24px; }
    .main { flex:1; padding: 28px 34px; min-width:0; }
    .breadcrumb { font-size:13px; color:#94a3b8; margin-bottom:6px; }
    .breadcrumb a { color:#38bdf8; }
    .page-title { font-size:26px; font-weight:700; margin: 0 0 6px 0; color:#f1f5f9; }
    .toolbar { display:flex; gap:12px; margin-bottom:10px; flex-wrap:wrap; align-items:center; }
    .toolbar form { display:flex; gap:8px; align-items:center; margin:0; flex-wrap:wrap; }
    .toolbar input, .toolbar select { margin:0; width:auto; min-width:160px; }
    .toolbar button { margin:0; width:auto; padding:10px 18px; }
    .btn-ghost { background: rgba(51,65,85,0.6) !important; color:#e2e8f0 !important; border:1px solid rgba(148,163,184,0.25) !important; }
    .empty-state { text-align:center; padding: 60px 20px; color:#64748b; }
    .empty-state .emoji { font-size:42px; margin-bottom:10px; }
    .profile-header { display:flex; align-items:center; gap:18px; padding:22px 26px; background: rgba(15,23,42,0.6); border:1px solid rgba(148,163,184,0.15); border-radius:18px; margin-bottom:26px; }
    .profile-stats { display:flex; gap:26px; margin-top:6px; font-size:13px; color:#94a3b8; }
    .profile-stats b { color:#e2e8f0; }
    .settings-row { display:flex; justify-content:space-between; align-items:center; padding:14px 0; border-bottom:1px solid rgba(148,163,184,0.12); }
    .settings-row:last-child { border-bottom:none; }
    @media (max-width: 800px) {
      .shell { flex-direction:column; }
      .sidebar { width:100%; flex-direction:row; overflow-x:auto; align-items:center; }
      .side-nav { flex-direction:row; }
      .main { padding: 20px; }
      .profile-header { flex-direction:column; text-align:center; }
    }
  </style></head>
  <body class="dash">
    <div class="bg-orb orb1"></div><div class="bg-orb orb2"></div><div class="bg-orb orb3"></div>
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">${logoSvg(28)}<span class="brand-name">JISAN SERVER</span></div>
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
            <a href="/" class="side-link ${activeKey === 'home' ? 'active' : ''}"><span class="side-icon">🏠</span> Dashboard</a>
            <a href="/settings" class="side-link ${activeKey === 'settings' ? 'active' : ''}"><span class="side-icon">⚙️</span> Advanced Settings</a>
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

// ---------- Helpers ----------
function requireLogin(req, res, next) {
  if (!req.session.username) return res.redirect('/login');
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.isAdmin) return res.redirect('/admin/login');
  next();
}
// Folders come from two places merged together: folders explicitly created
// (even if still empty) and folder names that already have files in them.
async function getFolders(username) {
  const [folderDocs, fileFolders] = await Promise.all([
    Folder.find({ username }).select('name -_id'),
    FileMeta.distinct('folder', { username })
  ]);
  const set = new Set([...folderDocs.map(f => f.name), ...fileFolders]);
  return Array.from(set).sort();
}
async function countAllFiles(username) {
  return FileMeta.countDocuments({ username });
}

// ---------- Register ----------
app.get('/register', (req, res) => {
  res.send(authPage('Register', `
    <h1>Create your account</h1>
    <form method="post" action="/register">
      <input name="username" placeholder="Choose a username" required />
      <input name="email" type="email" placeholder="Your email address" required />
      <p class="hint-text">📩 The verification email may land in your Spam / Junk folder — please check there too.</p>
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

    const existingUsername = await User.findOne({ username: clean });
    if (existingUsername) return res.send('Username already taken. <a href="/register">Back</a>');
    const existingEmail = await User.findOne({ email: cleanEmail });
    if (existingEmail) return res.send('Email already registered. <a href="/register">Back</a>');

    const hash = await bcrypt.hash(password, 10);
    const answerHash = await bcrypt.hash(securityAnswer.trim().toLowerCase(), 10);
    const verifyToken = crypto.randomBytes(24).toString('hex');

    const newUser = new User({
      username: clean, email: cleanEmail, password: hash,
      securityQuestion: securityQuestion.trim(), securityAnswer: answerHash,
      verified: false, verifyToken
    });
    await newUser.save();

    const verifyLink = `${BASE_URL}/verify-email?token=${verifyToken}`;
    try {
      await sendEmail(
        cleanEmail,
        'Verify your Jisan Server account',
        `<p>Hi ${clean},</p><p>Click below to verify your account:</p><p><a href="${verifyLink}">${verifyLink}</a></p>`
      );
    } catch (err) {
      console.error('Email send failed:', err.message);
      return res.send(`Account created, but the verification email failed to send (${err.message}). <a href="/resend-verification">Try resending</a> | <a href="/login">Go to login</a>`);
    }

    res.send(authPage('Check your email', `
      <h1>Verify your email</h1>
      <p>We sent a verification link to <strong>${cleanEmail}</strong>.</p>
      <p class="hint-text">📩 Not seeing it? Check your Spam / Junk folder.</p>
      <p><a href="/login">Back to login</a></p>
    `));
  } catch (err) {
    console.error('Register error:', err.message);
    res.send('Something went wrong during registration. <a href="/register">Try again</a>');
  }
});

// ---------- Email verification ----------
app.get('/verify-email', async (req, res) => {
  const { token } = req.query;
  const user = await User.findOne({ verifyToken: token });
  if (!user) return res.send('Invalid or expired verification link. <a href="/login">Back to login</a>');
  user.verified = true;
  user.verifyToken = undefined;
  await user.save();
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
    <p class="hint-text">📩 Remember to check your Spam / Junk folder too.</p>
    <p class="small-link"><a href="/login">Back to login</a></p>
  `));
});

app.post('/resend-verification', async (req, res) => {
  const clean = (req.body.username || '').trim().toLowerCase();
  const user = await User.findOne({ username: clean });
  if (!user) return res.send('No account found with that username. <a href="/resend-verification">Try again</a>');
  if (user.verified) return res.send('This account is already verified. <a href="/login">Log in</a>');

  const newToken = crypto.randomBytes(24).toString('hex');
  user.verifyToken = newToken;
  await user.save();

  const verifyLink = `${BASE_URL}/verify-email?token=${newToken}`;
  try {
    await sendEmail(
      user.email,
      'Verify your Jisan Server account (resent)',
      `<p>Hi ${user.username},</p><p>Here's your verification link again:</p><p><a href="${verifyLink}">${verifyLink}</a></p>`
    );
  } catch (err) {
    console.error('Resend email failed:', err.message);
    return res.send(`Failed to resend email: ${err.message} <a href="/resend-verification">Try again</a>`);
  }

  res.send(authPage('Email resent', `<h1>Verification email resent!</h1><p>Check <strong>${user.email}</strong>.</p><p class="hint-text">📩 Also check your Spam / Junk folder.</p><p><a href="/login">Back to login</a></p>`));
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

  const user = await User.findOne({ username: clean });
  if (!user) {
    await LoginAttempt.create({ username: clean, success: false, ip });
    return res.send('Wrong username or password. <a href="/login">Try again</a>');
  }
  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    await LoginAttempt.create({ username: clean, success: false, ip });
    return res.send('Wrong username or password. <a href="/login">Try again</a>');
  }
  if (!user.verified) {
    return res.send('Please verify your email before logging in. <a href="/resend-verification">Resend email</a>');
  }
  if (user.banned) {
    await LoginAttempt.create({ username: clean, success: false, ip });
    return res.send('This account has been suspended. <a href="/login">Back</a>');
  }

  await LoginAttempt.create({ username: clean, success: true, ip });
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
  const clean = (req.query.username || '').trim().toLowerCase();
  const user = await User.findOne({ username: clean });
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
  const user = await User.findOne({ username: clean });
  if (!user) return res.send('Account not found. <a href="/forgot-password">Try again</a>');
  const correct = await bcrypt.compare((answer || '').trim().toLowerCase(), user.securityAnswer);
  if (!correct) return res.send('Incorrect answer. <a href="/forgot-password">Try again</a>');
  if (!newPassword || newPassword.length < 3) return res.send('Password too short. <a href="/forgot-password">Try again</a>');
  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();
  res.send('Password reset successfully! <a href="/login">Log in now</a>');
});

// ---------- File storage (MongoDB GridFS — persists across redeploys) ----------
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB cap

function fileCardHtml(fileDoc) {
  const displayName = fileDoc.originalName || fileDoc.filename;
  const ext = path.extname(displayName).toLowerCase();
  const url = `/files/${encodeURIComponent(fileDoc.folder)}/${encodeURIComponent(fileDoc.filename)}`;
  let preview = '';
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) preview = `<img src="${url}" class="thumb" loading="lazy" />`;
  else if (['.mp4', '.webm', '.mov'].includes(ext)) preview = `<video src="${url}" class="thumb" muted></video>`;
  else if (ext === '.pdf') preview = `<div class="filetype">📕 PDF</div>`;
  else preview = `<div class="filetype">${ext.replace('.', '').toUpperCase() || 'FILE'}</div>`;

  const viewBtn = ext === '.pdf'
    ? `<a href="/view/${encodeURIComponent(fileDoc.folder)}/${encodeURIComponent(fileDoc.filename)}" class="overlay-btn" style="background:#38bdf8;color:#0b1120;border-radius:8px;padding:6px 10px;text-decoration:none;">Read</a>`
    : '';

  return `<div class="file-card">
    <div class="thumb-wrap">${preview}
      <div class="card-overlay">
        ${viewBtn}
        <a href="${url}" download class="overlay-btn" style="background:#1e293b;color:#e2e8f0;border-radius:8px;padding:6px 10px;text-decoration:none;">⬇</a>
      </div>
    </div>
    <p class="filename">${displayName}</p>
  </div>`;
}

// ---------- Dashboard ----------
app.get('/', requireLogin, async (req, res) => {
  const username = req.session.username;
  const folders = await getFolders(username);
  const folderOptions = folders.map(f => `<option value="${f}">${f}</option>`).join('');
  const fileCount = await countAllFiles(username);

  const folderCards = folders.map(f => `
    <a href="/folder/${encodeURIComponent(f)}" class="folder-card">
      <div class="folder-icon">📁</div>
      <div class="folder-name">${f}</div>
    </a>`).join('');

  const main = `
    <div class="breadcrumb">Home</div>
    <div class="profile-header">
      <div class="avatar avatar-lg">${username.charAt(0).toUpperCase()}</div>
      <div>
        <h1 class="page-title" style="margin-bottom:2px;">${username}</h1>
        <div class="profile-stats">
          <span><b>${folders.length}</b> folders</span>
          <span><b>${fileCount}</b> files</span>
        </div>
      </div>
    </div>

    <div class="toolbar">
      <form method="post" action="/create-folder">
        <input name="foldername" placeholder="New folder name" required />
        <button type="submit">+ Create Folder</button>
      </form>
      <form id="uploadForm" method="post" action="/upload" enctype="multipart/form-data">
        <select name="folder">
          <option value="general">general</option>
          ${folderOptions}
        </select>
        <input type="file" name="myfile" required />
        <button type="submit" class="btn-ghost">Upload File</button>
      </form>
    </div>
    <div class="progress-wrap" id="progressWrap">
      <div class="progress-bar-bg"><div class="progress-bar-fill" id="progressBar"></div></div>
      <div class="progress-label" id="progressLabel"></div>
    </div>

    <h3>Your Folders</h3>
    ${folders.length ? `<div class="grid">${folderCards}</div>` : `
      <div class="empty-state"><div class="emoji">📂</div><p>No folders yet — create one above to get started.</p></div>
    `}
    <script>uploadWithProgress('uploadForm', 'progressWrap', 'progressBar', 'progressLabel');</script>
  `;

  res.send(appPage('Dashboard', username, 'home', folders, main));
});

app.post('/create-folder', requireLogin, async (req, res) => {
  const folder = (req.body.foldername || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!folder) return res.send('Invalid folder name. <a href="/">Back</a>');
  try {
    await Folder.updateOne(
      { username: req.session.username, name: folder },
      { $setOnInsert: { username: req.session.username, name: folder } },
      { upsert: true }
    );
  } catch (e) { /* folder already exists — fine */ }
  res.redirect('/');
});

app.post('/upload', requireLogin, upload.single('myfile'), async (req, res) => {
  const username = req.session.username;
  const folder = (req.body.folder || 'general').replace(/[^a-zA-Z0-9_-]/g, '') || 'general';
  if (!req.file) return res.send('No file received. <a href="/">Back</a>');
  if (!gridBucket) return res.send('Storage is still starting up — try again in a few seconds. <a href="/">Back</a>');

  const storedName = `${Date.now()}-${req.file.originalname}`;
  const uploadStream = gridBucket.openUploadStream(storedName, { contentType: req.file.mimetype });
  uploadStream.end(req.file.buffer);

  uploadStream.on('error', (err) => {
    console.error('GridFS upload error:', err.message);
    res.send('Upload failed. <a href="/">Back</a>');
  });
  uploadStream.on('finish', async () => {
    try {
      await Folder.updateOne(
        { username, name: folder },
        { $setOnInsert: { username, name: folder } },
        { upsert: true }
      );
      await FileMeta.create({
        username, folder, filename: storedName, originalName: req.file.originalname,
        contentType: req.file.mimetype, size: req.file.size, gridId: uploadStream.id
      });
    } catch (e) {
      console.error('Saving file metadata failed:', e.message);
    }
    res.redirect(`/folder/${encodeURIComponent(folder)}`);
  });
});

// ---------- Folder view ----------
app.get('/folder/:folder', requireLogin, async (req, res) => {
  const username = req.session.username;
  const folders = await getFolders(username);
  const folder = req.params.folder;

  if (!folders.includes(folder)) {
    return res.send(appPage('Not found', username, null, folders, `<div class="empty-state"><div class="emoji">🚫</div><p>Folder not found.</p></div>`));
  }

  const files = await FileMeta.find({ username, folder }).sort({ uploadedAt: -1 });
  const cards = files.map(f => fileCardHtml(f)).join('');

  const main = `
    <div class="breadcrumb"><a href="/">Home</a> / ${folder}</div>
    <h1 class="page-title">${folder}</h1>
    <div class="toolbar">
      <form id="uploadForm2" method="post" action="/upload" enctype="multipart/form-data">
        <input type="hidden" name="folder" value="${folder}" />
        <input type="file" name="myfile" required />
        <button type="submit">Upload to "${folder}"</button>
      </form>
    </div>
    <div class="progress-wrap" id="progressWrap2">
      <div class="progress-bar-bg"><div class="progress-bar-fill" id="progressBar2"></div></div>
      <div class="progress-label" id="progressLabel2"></div>
    </div>
    ${files.length ? `<div class="grid">${cards}</div>` : `
      <div class="empty-state"><div class="emoji">🗂️</div><p>This folder is empty — upload your first file above.</p></div>
    `}
    <script>uploadWithProgress('uploadForm2', 'progressWrap2', 'progressBar2', 'progressLabel2');</script>
  `;

  res.send(appPage(folder, username, 'folder:' + folder, folders, main));
});

// ---------- Advanced settings ----------
app.get('/settings', requireLogin, async (req, res) => {
  const username = req.session.username;
  const folders = await getFolders(username);
  const totalFiles = await countAllFiles(username);
  const user = await User.findOne({ username });
  const attempts = await LoginAttempt.find({ username }).sort({ timestamp: -1 }).limit(10);

  const attemptsHtml = attempts.map(a => `
    <div class="settings-row">
      <span>${a.success ? '✅ Successful' : '❌ Failed'} — ${a.ip || 'unknown IP'}</span>
      <b>${new Date(a.timestamp).toLocaleString()}</b>
    </div>
  `).join('');

  const main = `
    <div class="breadcrumb">Home / Settings</div>
    <h1 class="page-title">Advanced Settings</h1>
    <div class="card" style="max-width:600px; padding:24px 28px;">
      <div class="settings-row"><span>Username</span><b>${user.username}</b></div>
      <div class="settings-row"><span>Email</span><b>${user.email}</b></div>
      <div class="settings-row"><span>Account status</span><b>${user.verified ? '✅ Verified' : '⏳ Not verified'}</b></div>
      <div class="settings-row"><span>Total folders</span><b>${folders.length}</b></div>
      <div class="settings-row"><span>Total files</span><b>${totalFiles}</b></div>
    </div>
    <h3 style="margin-top:26px;">Recent Login Attempts</h3>
    <div class="card" style="max-width:600px; padding:24px 28px;">
      ${attemptsHtml || '<p class="small-link">No login attempts recorded yet.</p>'}
    </div>
    <h3 style="margin-top:26px;">Change Password</h3>
    <div class="card" style="max-width:600px; padding:24px 28px;">
      <p class="small-link">Use "Forgot password" from the login page to reset your password via your security question.</p>
      <a href="/forgot-password">Go to password reset →</a>
    </div>
  `;

  res.send(appPage('Settings', username, 'settings', folders, main));
});

// ---------- PDF reader ----------
app.get('/view/:folder/:filename', requireLogin, async (req, res) => {
  const username = req.session.username;
  const folders = await getFolders(username);
  const folder = req.params.folder;
  const filename = req.params.filename;
  const url = `/files/${folder}/${encodeURIComponent(filename)}`;

  const main = `
    <div class="breadcrumb"><a href="/">Home</a> / <a href="/folder/${encodeURIComponent(folder)}">${folder}</a> / ${filename}</div>
    <h1 class="page-title">${filename}</h1>
    <div class="card" style="padding:0; overflow:hidden;">
      <iframe src="${url}" style="width:100%; height:80vh; border:none; border-radius:16px;"></iframe>
    </div>
  `;
  res.send(appPage(filename, username, 'folder:' + folder, folders, main));
});

app.get('/files/:folder/:filename', requireLogin, async (req, res) => {
  const username = req.session.username;
  const { folder, filename } = req.params;
  try {
    const fileDoc = await FileMeta.findOne({ username, folder, filename });
    if (!fileDoc) return res.status(404).send('Not found');
    if (!gridBucket) return res.status(503).send('Storage is still starting up, try again shortly.');
    res.set('Content-Type', fileDoc.contentType || 'application/octet-stream');
    const downloadStream = gridBucket.openDownloadStream(fileDoc.gridId);
    downloadStream.on('error', () => { if (!res.headersSent) res.status(404).end(); });
    downloadStream.pipe(res);
  } catch (e) {
    console.error('File retrieval error:', e.message);
    res.status(500).send('Error retrieving file');
  }
});

// ---------- Admin panel (private — only for the site owner) ----------
app.get('/admin/login', (req, res) => {
  res.send(authPage('Admin Login', `
    <h1>Admin Login</h1>
    <form method="post" action="/admin/login">
      <input name="username" placeholder="Admin username" required />
      <div class="pw-wrapper">
        <input id="admin-pw" name="password" type="password" placeholder="Admin password" required />
        <button type="button" id="admin-pw-eye" class="pw-toggle" onclick="togglePassword('admin-pw')">👁️</button>
      </div>
      <button type="submit">Log In</button>
    </form>
    <p class="small-link"><a href="/login">Back to regular login</a></p>
  `));
});

app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.redirect('/admin');
  }
  res.send('Invalid admin credentials. <a href="/admin/login">Try again</a>');
});

app.get('/admin/logout', (req, res) => {
  req.session.isAdmin = false;
  res.redirect('/admin/login');
});

app.get('/admin', requireAdmin, async (req, res) => {
  const users = await User.find().sort({ _id: -1 });
  const rows = await Promise.all(users.map(async u => {
    const filesCount = await FileMeta.countDocuments({ username: u.username });
    return `
    <tr>
      <td>${u.username}</td>
      <td>${u.email}</td>
      <td>${u.verified ? '✅' : '⏳'}</td>
      <td>${u.banned ? '🚫 Banned' : '✅ Active'}</td>
      <td>${filesCount}</td>
      <td>
        <form method="post" action="/admin/users/${encodeURIComponent(u.username)}/toggle-ban" style="display:inline; margin:0;">
          <button type="submit" class="ban-btn ${u.banned ? 'unban' : 'ban'}">${u.banned ? 'Unban' : 'Ban'}</button>
        </form>
      </td>
    </tr>`;
  }));

  const main = `
    <h1 class="page-title">All Users (${users.length})</h1>
    <p class="small-link" style="margin-bottom:20px;">Signed in as admin. <a href="/admin/logout">Log out of admin</a></p>
    <div class="card" style="overflow-x:auto;">
      <table class="admin-table">
        <thead><tr>
          <th>Username</th><th>Email</th><th>Verified</th><th>Status</th><th>Files</th><th>Action</th>
        </tr></thead>
        <tbody>${rows.join('') || '<tr><td colspan="6">No users yet.</td></tr>'}</tbody>
      </table>
    </div>
  `;
  res.send(adminPage('Admin Dashboard', main));
});

app.post('/admin/users/:username/toggle-ban', requireAdmin, async (req, res) => {
  const user = await User.findOne({ username: req.params.username });
  if (user) { user.banned = !user.banned; await user.save(); }
  res.redirect('/admin');
});

app.listen(PORT, () => {
  console.log(`Jisan Server running at ${BASE_URL}`);
});