const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// ---------- EMAIL CONFIG (from environment variables, not hardcoded) ----------
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  requireTLS: true,
  auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  family: 4,
  connectionTimeout: 10000
});

const DATA_DIR = path.join(__dirname, 'my-files');
const USERS_FILE = path.join(__dirname, 'users.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');

function getUsers() {
  return JSON.parse(fs.readFileSync(USERS_FILE));
}
function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-to-something-random-and-long',
  resave: false,
  saveUninitialized: false
}));

// ---------- Page wrapper ----------
function page(title, body) {
  const studyIcons = ['📚', '✏️', '📐', '🖊️', '🎓', '📖', '🧮', '📝', '🔬', '💡'];
  const floatingIcons = studyIcons.map((icon, i) => {
    const left = (i * 9.5 + 3) % 95;
    const duration = 14 + (i % 5) * 4;
    const delay = i * 1.3;
    const size = 22 + (i % 3) * 10;
    return `<span class="study-icon" style="left:${left}%; animation-duration:${duration}s; animation-delay:-${delay}s; font-size:${size}px;">${icon}</span>`;
  }).join('');

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8" />
    <title>${title} | Jisan Server</title>
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; height: 100%; font-family: 'Segoe UI', Roboto, Arial, sans-serif; color: #f1f5f9; overflow-x: hidden; }
      body {
        position: relative; min-height: 100vh; display: flex; justify-content: center; align-items: flex-start;
        padding: 40px 20px;
        background: linear-gradient(-45deg, #0f172a, #1e293b, #0c4a6e, #1e1b4b);
        background-size: 400% 400%; animation: gradientMove 18s ease infinite;
      }
      @keyframes gradientMove { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
      .study-bg { position: fixed; top: 0; left: 0; width: 100%; height: 100%; overflow: hidden; z-index: 0; pointer-events: none; }
      .study-icon { position: absolute; top: 110%; opacity: 0.18; animation-name: floatUp; animation-timing-function: linear; animation-iteration-count: infinite; filter: drop-shadow(0 0 6px rgba(56,189,248,0.3)); }
      @keyframes floatUp { 0% { transform: translateY(0) rotate(0deg); opacity: 0; } 10% { opacity: 0.18; } 90% { opacity: 0.18; } 100% { transform: translateY(-130vh) rotate(25deg); opacity: 0; } }
      .bg-orb { position: fixed; border-radius: 50%; filter: blur(60px); opacity: 0.3; z-index: 0; animation: floatOrb 12s ease-in-out infinite; }
      .orb1 { width: 320px; height: 320px; background: #38bdf8; top: -60px; left: -60px; animation-duration: 14s; }
      .orb2 { width: 260px; height: 260px; background: #818cf8; bottom: -60px; right: -40px; animation-duration: 16s; animation-delay: 2s; }
      .orb3 { width: 200px; height: 200px; background: #f472b6; top: 40%; right: 10%; animation-duration: 20s; animation-delay: 4s; }
      @keyframes floatOrb { 0%, 100% { transform: translateY(0) translateX(0); } 50% { transform: translateY(-30px) translateX(20px); } }
      .card {
        position: relative; z-index: 1; background: rgba(30, 41, 59, 0.75);
        backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
        border-radius: 18px; padding: 32px 36px; max-width: 740px; width: 100%;
        box-shadow: 0 20px 60px rgba(0,0,0,0.5); border: 1px solid rgba(148,163,184,0.2);
      }
      .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
      .brand-dot { width: 12px; height: 12px; border-radius: 50%; background: #38bdf8; box-shadow: 0 0 12px #38bdf8; }
      .brand-name { font-weight: 700; letter-spacing: 0.5px; color: #38bdf8; font-size: 15px; }
      h1 { font-size: 22px; margin-top: 0; color: #e2e8f0; }
      h3 { color: #93c5fd; margin-bottom: 8px; }
      a { color: #38bdf8; text-decoration: none; }
      a:hover { text-decoration: underline; }
      input, select, button { width: 100%; padding: 11px 12px; margin: 6px 0 14px 0; border-radius: 10px; border: 1px solid #334155; background: rgba(15, 23, 42, 0.8); color: #f1f5f9; font-size: 14px; }
      input:focus, select:focus { outline: none; border-color: #38bdf8; }
      button { background: linear-gradient(135deg, #38bdf8, #6366f1); color: #0f172a; font-weight: 700; border: none; cursor: pointer; transition: 0.2s; letter-spacing: 0.3px; }
      button:hover { filter: brightness(1.1); transform: translateY(-1px); }
      .topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
      .badge { background: rgba(51,65,85,0.7); padding: 5px 12px; border-radius: 20px; font-size: 12px; }
      .small-link { font-size: 13px; color: #94a3b8; }
      .pw-wrapper { position: relative; }
      .pw-wrapper input { padding-right: 40px; }
      .pw-toggle { position: absolute; right: 10px; top: 8px; cursor: pointer; background: none; border: none; width: auto; padding: 0; margin: 0; font-size: 16px; color: #94a3b8; }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 14px; margin-bottom: 20px; }
      .file-card { background: rgba(15, 23, 42, 0.85); border: 1px solid #334155; border-radius: 12px; padding: 8px; text-align: center; transition: 0.2s; }
      .file-card:hover { border-color: #38bdf8; transform: translateY(-2px); }
      .thumb { width: 100%; height: 100px; object-fit: cover; border-radius: 8px; background: #1e293b; }
      .thumb.pdf { height: 100px; }
      .filetype { display: flex; align-items: center; justify-content: center; height: 100px; color: #94a3b8; font-weight: 700; font-size: 13px; background: #1e293b; border-radius: 8px; }
      .filename { font-size: 12px; color: #cbd5e1; margin: 6px 0 4px 0; word-break: break-word; }
      .download-link { font-size: 12px; }
    </style>
  </head>
  <body>
    <div class="study-bg">${floatingIcons}</div>
    <div class="bg-orb orb1"></div>
    <div class="bg-orb orb2"></div>
    <div class="bg-orb orb3"></div>
    <div class="card">
      <div class="brand"><span class="brand-dot"></span><span class="brand-name">JISAN SERVER</span></div>
      ${body}
    </div>
    <script>
      function togglePassword(id) {
        const input = document.getElementById(id);
        const btn = document.getElementById(id + '-eye');
        if (input.type === 'password') { input.type = 'text'; btn.textContent = '🙈'; }
        else { input.type = 'password'; btn.textContent = '👁️'; }
      }
    </script>
  </body>
  </html>`;
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

// ---------- Register ----------
app.get('/register', (req, res) => {
  res.send(page('Register', `
    <h1>Create your account</h1>
    <form method="post" action="/register">
      <input name="username" placeholder="Choose a username" required />
      <input name="email" type="email" placeholder="Your email address" required />
      <div class="pw-wrapper">
        <input id="reg-pw" name="password" type="password" placeholder="Choose a password" required />
        <button type="button" id="reg-pw-eye" class="pw-toggle" onclick="togglePassword('reg-pw')">👁️</button>
      </div>
      <input name="securityQuestion" placeholder="Security question (e.g. Your first pet's name?)" required />
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
  if (users.find(u => u.username === clean)) {
    return res.send('Username already taken. <a href="/register">Back</a>');
  }
  if (users.find(u => u.email === cleanEmail)) {
    return res.send('Email already registered. <a href="/register">Back</a>');
  }

  const hash = await bcrypt.hash(password, 10);
  const answerHash = await bcrypt.hash(securityAnswer.trim().toLowerCase(), 10);
  const verifyToken = crypto.randomBytes(24).toString('hex');

  users.push({
    username: clean,
    email: cleanEmail,
    password: hash,
    securityQuestion: securityQuestion.trim(),
    securityAnswer: answerHash,
    verified: false,
    verifyToken
  });
  saveUsers(users);
  userDir(clean);

  const verifyLink = `${BASE_URL}/verify-email?token=${verifyToken}`;
  try {
    await transporter.sendMail({
      from: `"Jisan Server" <${GMAIL_USER}>`,
      to: cleanEmail,
      subject: 'Verify your Jisan Server account',
      html: `<p>Hi ${clean},</p><p>Click below to verify your account:</p><p><a href="${verifyLink}">${verifyLink}</a></p>`
    });
  } catch (err) {
    console.error('Email send failed:', err.message);
    return res.send('Account created, but the verification email failed to send. Check server logs. <a href="/login">Go to login</a>');
  }

  res.send(page('Check your email', `
    <h1>Verify your email</h1>
    <p>We sent a verification link to <strong>${cleanEmail}</strong>. Click the link in that email before logging in.</p>
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
  res.send(page('Verified', `
    <h1>Email verified!</h1>
    <p>Your account is now active.</p>
    <p><a href="/login">Log in now</a></p>
  `));
});

// ---------- Login / Logout ----------
app.get('/login', (req, res) => {
  res.send(page('Login', `
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
    <p>No account yet? <a href="/register">Register</a></p>
  `));
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const clean = (username || '').trim().toLowerCase();
  const users = getUsers();
  const user = users.find(u => u.username === clean);
  if (!user) {
    return res.send('Wrong username or password (no account found). <a href="/login">Try again</a>');
  }
  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.send('Wrong username or password (password mismatch). <a href="/login">Try again</a>');
  }
  if (!user.verified) {
    return res.send('Please verify your email before logging in. Check your inbox. <a href="/login">Back to login</a>');
  }
  req.session.username = clean;
  res.redirect('/');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// ---------- Forgot password flow ----------
app.get('/forgot-password', (req, res) => {
  res.send(page('Forgot Password', `
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
  if (!user) return res.send('No account found with that username. <a href="/forgot-password">Try again</a>');

  res.send(page('Security Question', `
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

  if (!newPassword || newPassword.length < 3) {
    return res.send('Password too short. <a href="/forgot-password">Try again</a>');
  }

  user.password = await bcrypt.hash(newPassword, 10);
  saveUsers(users);
  res.send('Password reset successfully! <a href="/login">Log in now</a>');
});

// ---------- File storage (per-user) ----------
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

function getFolders(username) {
  const dir = userDir(username);
  return fs.readdirSync(dir).filter(f => fs.statSync(path.join(dir, f)).isDirectory());
}

// ---------- Dashboard ----------
app.get('/', requireLogin, (req, res) => {
  const folders = getFolders(req.session.username);
  const folderOptions = folders.map(f => `<option value="${f}">${f}</option>`).join('');

  res.send(page('Dashboard', `
    <div class="topbar">
      <h1>Welcome, ${req.session.username}</h1>
      <span class="badge"><a href="/logout">Log out</a></span>
    </div>

    <h3>Create a folder</h3>
    <form method="post" action="/create-folder">
      <input name="foldername" placeholder="e.g. Photos, Videos, PDFs" required />
      <button type="submit">Create Folder</button>
    </form>

    <h3>Upload a file</h3>
    <form method="post" action="/upload" enctype="multipart/form-data">
      <select name="folder">
        <option value="general">general</option>
        ${folderOptions}
      </select>
      <input type="file" name="myfile" required />
      <button type="submit">Upload</button>
    </form>

    <p><a href="/list">View my files</a></p>
  `));
});

app.post('/create-folder', requireLogin, (req, res) => {
  const folder = (req.body.foldername || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!folder) return res.send('Invalid folder name. <a href="/">Back</a>');
  fs.mkdirSync(path.join(userDir(req.session.username), folder), { recursive: true });
  res.redirect('/');
});

app.post('/upload', requireLogin, upload.single('myfile'), (req, res) => {
  res.redirect('/list');
});

// ---------- List with previews ----------
app.get('/list', requireLogin, (req, res) => {
  const folders = getFolders(req.session.username);
  let body = `<div class="topbar"><h1>Your Files</h1><span class="badge"><a href="/">Back</a></span></div>`;

  folders.forEach(folder => {
    const folderPath = path.join(userDir(req.session.username), folder);
    const files = fs.readdirSync(folderPath);
    body += `<h3>${folder}</h3><div class="grid">`;

    files.forEach(f => {
      const ext = path.extname(f).toLowerCase();
      const url = `/files/${folder}/${encodeURIComponent(f)}`;

      let preview = '';
      if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
        preview = `<img src="${url}" class="thumb" />`;
      } else if (['.mp4', '.webm', '.mov'].includes(ext)) {
        preview = `<video src="${url}" class="thumb" controls></video>`;
      } else if (ext === '.pdf') {
        preview = `<embed src="${url}" class="thumb pdf" type="application/pdf" />`;
      } else {
        preview = `<div class="filetype">${ext.replace('.', '').toUpperCase() || 'FILE'}</div>`;
      }

      body += `
        <div class="file-card">
          ${preview}
          <p class="filename">${f}</p>
          <a href="${url}" download class="download-link">Download</a>
        </div>`;
    });

    body += `</div>`;
  });

  res.send(page('Your Files', body));
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