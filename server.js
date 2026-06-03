const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { initDatabase, query, get, close, saveDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'public', 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Invalid file type'));
  }
});

// Image upload config (avatars)
const imgStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'public', 'avatars');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const uploadImg = multer({
  storage: imgStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only images allowed (jpg, png, gif, webp)'));
  }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'groove-lab-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));

// Auth middleware
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

async function requireAdmin(req, res, next) {
  try {
    if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
    const user = await get('SELECT * FROM users WHERE id = ?', [req.session.userId]);
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    req.currentUser = user;
    next();
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

// ===================== AUTH ROUTES ===================== //

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { firstName, surname, email, password, gender, dob } = req.body;
    if (!firstName || !surname || !email || !password) return res.status(400).json({ error: 'Missing fields' });
    const existing = await get('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) return res.status(409).json({ error: 'Email already registered' });
    const hash = await bcrypt.hash(password, 10);
    const result = await query('INSERT INTO users (first_name, surname, email, password, gender, dob) VALUES (?, ?, ?, ?, ?, ?)',
      [firstName, surname, email, hash, gender || '', dob || '']);
    const userId = result.lastInsertId;

    // Give new user default achievements
    await query('INSERT INTO achievements (user_id, badge_name) VALUES (?, ?)', [userId, 'Rising Star']);

    req.session.userId = userId;
    const user = await get('SELECT id, first_name, surname, email, role, avatar, bio FROM users WHERE id = ?', [userId]);
    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    if (user.banned) return res.status(403).json({ error: 'Account banned' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid email or password' });
    req.session.userId = user.id;
    const { password: _, ...safeUser } = user;
    res.json({ user: safeUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/auth/me', async (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const user = await get('SELECT id, first_name, surname, email, role, avatar, bio, gender, joined_at FROM users WHERE id = ?', [req.session.userId]);
  res.json({ user: user || null });
});

// ===================== USER ROUTES ===================== //

app.get('/api/users/:id', requireAuth, async (req, res) => {
  const user = await get('SELECT id, first_name, surname, email, role, avatar, bio, gender, joined_at FROM users WHERE id = ?', [req.params.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const lessonCount = await query('SELECT COUNT(*) as c FROM lesson_progress WHERE user_id = ? AND quiz_passed = 1', [req.params.id]);
  const achievementCount = await query('SELECT COUNT(*) as c FROM achievements WHERE user_id = ?', [req.params.id]);
  const uploadCount = await query('SELECT COUNT(*) as c FROM uploads WHERE user_id = ?', [req.params.id]);
  res.json({ user, stats: { lessons: lessonCount[0]?.c || 0, achievements: achievementCount[0]?.c || 0, uploads: uploadCount[0]?.c || 0 } });
});

app.put('/api/users/:id', requireAuth, async (req, res) => {
  if (req.session.userId != req.params.id) return res.status(403).json({ error: 'Unauthorized' });
  const { bio, avatar } = req.body;
  if (bio !== undefined) await query('UPDATE users SET bio = ? WHERE id = ?', [bio, req.params.id]);
  if (avatar !== undefined) await query('UPDATE users SET avatar = ? WHERE id = ?', [avatar, req.params.id]);
  const user = await get('SELECT id, first_name, surname, email, role, avatar, bio FROM users WHERE id = ?', [req.params.id]);
  res.json({ user });
});

app.post('/api/users/:id/avatar', requireAuth, uploadImg.single('avatar'), async (req, res) => {
  if (req.session.userId != req.params.id) return res.status(403).json({ error: 'Unauthorized' });
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
  const avatarUrl = '/avatars/' + req.file.filename;
  await query('UPDATE users SET avatar = ? WHERE id = ?', [avatarUrl, req.params.id]);
  res.json({ avatar: avatarUrl });
});

// ===================== POSTS ROUTES ===================== //

app.get('/api/posts', async (req, res) => {
  const tag = req.query.tag;
  let sql = `SELECT p.*, u.first_name || ' ' || u.surname as author, u.avatar as author_avatar
    FROM posts p JOIN users u ON p.user_id = u.id`;
  const params = [];
  if (tag && tag !== 'all') {
    sql += ' WHERE p.tag = ?';
    params.push(tag);
  }
  sql += ' ORDER BY p.created_at DESC';
  const posts = await query(sql, params);
  // Check if current user liked each post
  if (req.session.userId) {
    const likes = await query('SELECT post_id FROM likes WHERE user_id = ?', [req.session.userId]);
    const likedIds = new Set(likes.map(l => l.post_id));
    posts.forEach(p => p.liked = likedIds.has(p.id));
  }
  res.json({ posts });
});

app.post('/api/posts', requireAuth, async (req, res) => {
  const { title, content, tag } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Missing fields' });
  const result = await query('INSERT INTO posts (user_id, title, content, tag) VALUES (?, ?, ?, ?)',
    [req.session.userId, title, content, tag || 'General']);
  res.json({ post: { id: result.lastInsertId } });
});

app.post('/api/posts/:id/like', requireAuth, async (req, res) => {
  const postId = req.params.id;
  const existing = await get('SELECT id FROM likes WHERE post_id = ? AND user_id = ?', [postId, req.session.userId]);
  if (existing) {
    await query('DELETE FROM likes WHERE post_id = ? AND user_id = ?', [postId, req.session.userId]);
    await query('UPDATE posts SET likes_count = likes_count - 1 WHERE id = ?', [postId]);
    res.json({ liked: false });
  } else {
    await query('INSERT INTO likes (post_id, user_id) VALUES (?, ?)', [postId, req.session.userId]);
    await query('UPDATE posts SET likes_count = likes_count + 1 WHERE id = ?', [postId]);
    res.json({ liked: true });
  }
});

app.get('/api/posts/:id/comments', async (req, res) => {
  const comments = await query(`SELECT c.*, u.first_name || ' ' || u.surname as author, u.avatar as author_avatar
    FROM comments c JOIN users u ON c.user_id = u.id WHERE c.post_id = ? ORDER BY c.created_at ASC`, [req.params.id]);
  res.json({ comments });
});

app.post('/api/posts/:id/comments', requireAuth, async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Missing content' });
  await query('INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)', [req.params.id, req.session.userId, content]);
  await query('UPDATE posts SET comments_count = comments_count + 1 WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// ===================== UPLOADS ROUTES ===================== //

app.get('/api/uploads', requireAuth, async (req, res) => {
  const userId = req.query.user_id;
  let sql = `SELECT u.*, usr.first_name || ' ' || usr.surname as author, usr.avatar as author_avatar
    FROM uploads u JOIN users usr ON u.user_id = usr.id`;
  const params = [];
  if (userId) { sql += ' WHERE u.user_id = ?'; params.push(userId); }
  sql += ' ORDER BY u.created_at DESC';
  res.json({ uploads: await query(sql, params) });
});

app.post('/api/uploads', requireAuth, upload.single('file'), async (req, res) => {
  const { title, genre, description, tags, bpm, key } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const filename = req.file ? req.file.filename : null;
  const result = await query('INSERT INTO uploads (user_id, title, genre, description, tags, bpm, key, filename) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [req.session.userId, title, genre || 'Other', description || '', tags || '', bpm || null, key || '', filename]);
  await query('INSERT INTO achievements (user_id, badge_name) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM achievements WHERE user_id = ? AND badge_name = ?)',
    [req.session.userId, 'First Upload', req.session.userId, 'First Upload']);
  res.json({ upload: { id: result.lastInsertId } });
});

app.delete('/api/uploads/:id', requireAuth, async (req, res) => {
  const upload = await get('SELECT * FROM uploads WHERE id = ?', [req.params.id]);
  if (!upload) return res.status(404).json({ error: 'Not found' });
  if (upload.user_id !== req.session.userId) {
    const user = await get('SELECT role FROM users WHERE id = ?', [req.session.userId]);
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
  }
  if (upload.filename) {
    const filepath = path.join(__dirname, 'public', 'uploads', upload.filename);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  }
  await query('DELETE FROM uploads WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// ===================== LESSONS ROUTES ===================== //

app.get('/api/lessons', async (req, res) => {
  const lessons = await query('SELECT * FROM lessons ORDER BY order_index ASC');
  // Get user progress if logged in
  if (req.session.userId) {
    const progress = await query('SELECT lesson_id, quiz_passed FROM lesson_progress WHERE user_id = ?', [req.session.userId]);
    const progMap = {};
    progress.forEach(p => progMap[p.lesson_id] = p.quiz_passed);
    lessons.forEach(l => l.completed = progMap[l.id] || false);
  }
  res.json({ lessons });
});

app.post('/api/lessons/:id/complete', requireAuth, async (req, res) => {
  const lessonId = req.params.id;
  const { passed } = req.body;
  const existing = await get('SELECT id FROM lesson_progress WHERE user_id = ? AND lesson_id = ?', [req.session.userId, lessonId]);
  if (existing) {
    await query('UPDATE lesson_progress SET quiz_passed = ?, completed_at = CURRENT_TIMESTAMP WHERE user_id = ? AND lesson_id = ?',
      [passed ? 1 : 0, req.session.userId, lessonId]);
  } else {
    await query('INSERT INTO lesson_progress (user_id, lesson_id, quiz_passed) VALUES (?, ?, ?)',
      [req.session.userId, lessonId, passed ? 1 : 0]);
  }
  // Check achievement
  const done = await query('SELECT COUNT(*) as c FROM lesson_progress WHERE user_id = ? AND quiz_passed = 1', [req.session.userId]);
  const count = done[0]?.c || 0;
  if (count >= 4) {
    await query('INSERT OR IGNORE INTO achievements (user_id, badge_name) VALUES (?, ?)', [req.session.userId, 'Drummer']);
  }
  res.json({ ok: true });
});

app.get('/api/lessons/progress', requireAuth, async (req, res) => {
  const progress = await query(`SELECT lp.*, l.title, l.category FROM lesson_progress lp
    JOIN lessons l ON lp.lesson_id = l.id WHERE lp.user_id = ?`, [req.session.userId]);
  const achievements = await query('SELECT * FROM achievements WHERE user_id = ?', [req.session.userId]);
  res.json({ progress, achievements });
});

// ===================== COMMUNITY ACTIVITY ===================== //

app.get('/api/activity', requireAuth, async (req, res) => {
  const activities = [];
  const posts = await query('SELECT p.title, p.created_at FROM posts p WHERE p.user_id = ? ORDER BY p.created_at DESC LIMIT 5', [req.session.userId]);
  posts.forEach(p => activities.push({ type: 'post', text: `Created post "${p.title}"`, time: p.created_at }));

  const progress = await query(`SELECT lp.completed_at, l.title FROM lesson_progress lp
    JOIN lessons l ON lp.lesson_id = l.id WHERE lp.user_id = ? AND lp.quiz_passed = 1 ORDER BY lp.completed_at DESC LIMIT 5`, [req.session.userId]);
  progress.forEach(p => activities.push({ type: 'lesson', text: `Completed "${p.title}" lesson`, time: p.completed_at }));

  const uploads = await query('SELECT title, created_at FROM uploads WHERE user_id = ? ORDER BY created_at DESC LIMIT 5', [req.session.userId]);
  uploads.forEach(u => activities.push({ type: 'upload', text: `Uploaded "${u.title}"`, time: u.created_at }));

  const achievements = await query('SELECT badge_name, earned_at FROM achievements WHERE user_id = ? ORDER BY earned_at DESC LIMIT 5', [req.session.userId]);
  achievements.forEach(a => activities.push({ type: 'achievement', text: `Earned "${a.badge_name}" badge`, time: a.earned_at }));

  activities.sort((a, b) => new Date(b.time) - new Date(a.time));
  res.json({ activities: activities.slice(0, 10) });
});

// ===================== ADMIN ROUTES ===================== //

app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  const users = await query('SELECT COUNT(*) as c FROM users');
  const lessons = await query('SELECT COUNT(*) as c FROM lessons');
  const uploads = await query('SELECT COUNT(*) as c FROM uploads');
  const posts = await query('SELECT COUNT(*) as c FROM posts');
  const reports = await query('SELECT COUNT(*) as c FROM users WHERE banned = 1');
  const todayUsers = await query("SELECT COUNT(*) as c FROM users WHERE date(joined_at) = date('now')");
  res.json({
    users: users[0]?.c || 0,
    lessons: lessons[0]?.c || 0,
    uploads: uploads[0]?.c || 0,
    posts: posts[0]?.c || 0,
    reports: reports[0]?.c || 0,
    todayUsers: todayUsers[0]?.c || 0
  });
});

app.get('/api/admin/users', requireAdmin, async (req, res) => {
  const users = await query('SELECT id, first_name, surname, email, role, avatar, banned, joined_at FROM users ORDER BY joined_at DESC');
  res.json({ users });
});

app.post('/api/admin/users/:id/ban', requireAdmin, async (req, res) => {
  const user = await get('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!user) return res.status(404).json({ error: 'Not found' });
  const newStatus = user.banned ? 0 : 1;
  await query('UPDATE users SET banned = ? WHERE id = ?', [newStatus, req.params.id]);
  res.json({ banned: newStatus === 1 });
});

app.post('/api/admin/users/:id/warn', requireAdmin, async (req, res) => {
  await query('INSERT INTO notifications (user_id, message) VALUES (?, ?)', [req.params.id, 'You have received a warning from the admin.']);
  res.json({ ok: true });
});

app.get('/api/admin/reports', requireAdmin, async (req, res) => {
  const reports = await query(`SELECT n.*, u.first_name || ' ' || u.surname as user_name
    FROM notifications n JOIN users u ON n.user_id = u.id ORDER BY n.created_at DESC LIMIT 20`);
  res.json({ reports });
});

// ===================== LESSON MANAGEMENT (ADMIN) ===================== //

app.get('/api/admin/lessons', requireAdmin, async (req, res) => {
  const lessons = await query('SELECT * FROM lessons ORDER BY order_index');
  res.json({ lessons });
});

app.post('/api/admin/lessons', requireAdmin, async (req, res) => {
  const { title, description, category, video_url, order_index } = req.body;
  if (!title || !description || !category || !video_url) {
    return res.status(400).json({ error: 'Title, description, category, and video_url are required' });
  }
  const result = await query('INSERT INTO lessons (title, description, category, video_url, order_index) VALUES (?, ?, ?, ?, ?)',
    [title, description, category, video_url, order_index || 0]);
  const lesson = await get('SELECT * FROM lessons WHERE id = ?', [result.lastInsertId]);
  res.json({ lesson });
});

app.put('/api/admin/lessons/:id', requireAdmin, async (req, res) => {
  const lesson = await get('SELECT * FROM lessons WHERE id = ?', [req.params.id]);
  if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
  const { title, description, category, video_url, order_index } = req.body;
  await query('UPDATE lessons SET title = ?, description = ?, category = ?, video_url = ?, order_index = ? WHERE id = ?',
    [title || lesson.title, description || lesson.description, category || lesson.category, video_url || lesson.video_url, order_index ?? lesson.order_index, req.params.id]);
  const updated = await get('SELECT * FROM lessons WHERE id = ?', [req.params.id]);
  res.json({ lesson: updated });
});

app.delete('/api/admin/lessons/:id', requireAdmin, async (req, res) => {
  const lesson = await get('SELECT * FROM lessons WHERE id = ?', [req.params.id]);
  if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
  await query('DELETE FROM lesson_progress WHERE lesson_id = ?', [req.params.id]);
  await query('DELETE FROM lessons WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// ===================== USER PROGRESS (ADMIN) ===================== //

app.get('/api/admin/progress', requireAdmin, async (req, res) => {
  const users = await query("SELECT id, first_name, surname, email, avatar, banned, joined_at FROM users ORDER BY joined_at DESC");
  const progress = await query(`SELECT lp.*, l.title as lesson_title, l.category FROM lesson_progress lp JOIN lessons l ON lp.lesson_id = l.id ORDER BY lp.user_id, lp.completed_at`);
  const achievements = await query(`SELECT a.*, u.first_name || ' ' || u.surname as user_name FROM achievements a JOIN users u ON a.user_id = u.id ORDER BY a.earned_at`);
  const progressByUser = {};
  for (const p of progress) {
    if (!progressByUser[p.user_id]) progressByUser[p.user_id] = { completed: 0, lessons: [] };
    progressByUser[p.user_id].completed++;
    progressByUser[p.user_id].lessons.push(p);
  }
  const achievementsByUser = {};
  for (const a of achievements) {
    if (!achievementsByUser[a.user_id]) achievementsByUser[a.user_id] = [];
    achievementsByUser[a.user_id].push(a);
  }
  res.json({ users, progressByUser, achievementsByUser });
});

// ===================== DELETE USER (ADMIN) ===================== //

app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  const user = await get('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const id = req.params.id;
  await query('DELETE FROM notifications WHERE user_id = ?', [id]);
  await query('DELETE FROM achievements WHERE user_id = ?', [id]);
  await query('DELETE FROM lesson_progress WHERE user_id = ?', [id]);
  const userPosts = await query('SELECT id FROM posts WHERE user_id = ?', [id]);
  for (const p of userPosts) await query('DELETE FROM likes WHERE post_id = ?', [p.id]);
  await query('DELETE FROM comments WHERE user_id = ?', [id]);
  await query('DELETE FROM posts WHERE user_id = ?', [id]);
  await query('DELETE FROM uploads WHERE user_id = ?', [id]);
  await query('DELETE FROM users WHERE id = ?', [id]);
  res.json({ ok: true });
});

// ===================== SEARCH ===================== //

app.get('/api/search', async (req, res) => {
  const q = req.query.q;
  if (!q || q.length < 2) return res.json({ results: [] });
  const like = `%${q}%`;
  const users = await query("SELECT id, first_name || ' ' || surname as name, avatar, 'user' as type FROM users WHERE first_name || ' ' || surname LIKE ? LIMIT 5", [like]);
  const lessons = await query("SELECT id, title as name, category as info, 'lesson' as type FROM lessons WHERE title LIKE ? LIMIT 5", [like]);
  const uploads = await query("SELECT u.id, u.title as name, 'upload' as type, usr.first_name || ' ' || usr.surname as info FROM uploads u JOIN users usr ON u.user_id = usr.id WHERE u.title LIKE ? LIMIT 5", [like]);
  res.json({ results: [...users, ...lessons, ...uploads] });
});

// ===================== NOTIFICATIONS ===================== //

app.get('/api/notifications', requireAuth, async (req, res) => {
  const notifs = await query('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 10', [req.session.userId]);
  res.json({ notifications: notifs });
});

// ===================== ERROR HANDLER ===================== //

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

// ===================== START ===================== //

async function start() {
  console.log('Initializing database...');
  await initDatabase();
  app.listen(PORT, () => {
    console.log(`Groove Lab server running at http://localhost:${PORT}`);
  });
}

start();
