const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const app = express();
const PORT = process.env.PORT || 3000;

// Database setup
const adapter = new FileSync('db.json');
const db = low(adapter);

// Initialize database with default values
db.defaults({ submissions: [], admin: { username: 'admin', password: bcrypt.hashSync('Lysykh12', 10) } })
  .write();

// Custom MemoryStore without warning
// Для маленького проекта MemoryStore - это нормально
const MemoryStore = session.MemoryStore;
class SilentMemoryStore extends MemoryStore {
  constructor() {
    super();
    // Отключаем предупреждение
    this.emit = function(event) {
      if (event !== 'disconnect') {
        MemoryStore.prototype.emit.apply(this, arguments);
      }
    };
  }
}

// Middleware
app.use(cors({
    origin: [
        'https://julian901-1.github.io',
        'https://lolittamarulina.ru',
        'https://www.lolittamarulina.ru',
        'http://localhost:3000',
        'http://127.0.0.1:5500'
    ],
    credentials: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  store: new SilentMemoryStore(),
  secret: 'lolittastudio-secret-key-2025',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Note: Static files are served from GitHub Pages, not from this backend

// Authentication middleware
function isAuthenticated(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
}

// API Routes

// Health check / Ping endpoint (для Google Apps Script heartbeat)
app.get('/ping', (req, res) => {
  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    message: 'Server is alive'
  });
});

// Submit form
app.post('/api/submissions', (req, res) => {
  try {
    const submission = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      ...req.body
    };

    db.get('submissions')
      .push(submission)
      .write();

    res.json({ success: true, message: 'Submission received', id: submission.id });
  } catch (error) {
    console.error('Error saving submission:', error);
    res.status(500).json({ error: 'Failed to save submission' });
  }
});

// Admin login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  const admin = db.get('admin').value();

  if (username === admin.username && bcrypt.compareSync(password, admin.password)) {
    req.session.authenticated = true;
    req.session.username = username;
    res.json({ success: true, message: 'Logged in successfully' });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Admin logout
app.post('/api/admin/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true, message: 'Logged out successfully' });
});

// Check authentication status
app.get('/api/admin/status', (req, res) => {
  res.json({ authenticated: !!req.session.authenticated });
});

// Get all submissions (protected)
app.get('/api/admin/submissions', isAuthenticated, (req, res) => {
  const submissions = db.get('submissions').value();
  res.json(submissions.reverse()); // Latest first
});

// Get single submission (protected)
app.get('/api/admin/submissions/:id', isAuthenticated, (req, res) => {
  const submission = db.get('submissions')
    .find({ id: parseInt(req.params.id) })
    .value();

  if (submission) {
    res.json(submission);
  } else {
    res.status(404).json({ error: 'Submission not found' });
  }
});

// Delete submission (protected)
app.delete('/api/admin/submissions/:id', isAuthenticated, (req, res) => {
  db.get('submissions')
    .remove({ id: parseInt(req.params.id) })
    .write();

  res.json({ success: true, message: 'Submission deleted' });
});

// Serve admin panel
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Root endpoint - redirect to GitHub Pages
app.get('/', (req, res) => {
  res.json({
    message: 'LolittaStudio Backend API',
    endpoints: {
      ping: '/ping',
      submissions: '/api/submissions',
      admin: '/admin',
      adminLogin: '/api/admin/login'
    },
    website: 'https://julian901-1.github.io/LolittaStudio_Website/'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Main site: http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin`);
});
