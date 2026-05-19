const path = require('path');
const fs = require('fs');

const usePostgres = !!process.env.DATABASE_URL;
let db = null;
let pgPool = null;

function convertSql(sql) {
  if (!usePostgres) return sql;
  let result = sql;
  let conflictIgnore = false;
  result = result.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, () => { conflictIgnore = true; return 'INSERT INTO' });
  let idx = 0;
  result = result.replace(/\?/g, () => `$${++idx}`);
  result = result.replace(/date\('now'\)/gi, 'CURRENT_DATE');
  result = result.replace(/date\((\w+)\)/gi, '$1::DATE');
  if (conflictIgnore && !result.toUpperCase().includes('ON CONFLICT')) {
    result += ' ON CONFLICT DO NOTHING';
  }
  return result;
}

function needsReturning(sql) {
  const s = sql.trim().toUpperCase();
  return s.startsWith('INSERT') && !s.includes('RETURNING');
}

async function initDatabase() {
  if (usePostgres) {
    const { Pool } = require('pg');
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    });

    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        first_name TEXT NOT NULL,
        surname TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        gender TEXT, dob TEXT,
        role TEXT DEFAULT 'user',
        avatar TEXT DEFAULT 'https://i.pravatar.cc/200?img=32',
        bio TEXT DEFAULT '',
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        banned INTEGER DEFAULT 0
      )
    `);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS posts (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), title TEXT NOT NULL, content TEXT NOT NULL, tag TEXT DEFAULT 'General', likes_count INTEGER DEFAULT 0, comments_count INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS comments (id SERIAL PRIMARY KEY, post_id INTEGER NOT NULL REFERENCES posts(id), user_id INTEGER NOT NULL REFERENCES users(id), content TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS likes (id SERIAL PRIMARY KEY, post_id INTEGER NOT NULL REFERENCES posts(id), user_id INTEGER NOT NULL REFERENCES users(id), UNIQUE(post_id, user_id))`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS uploads (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), title TEXT NOT NULL, genre TEXT DEFAULT 'Other', description TEXT DEFAULT '', tags TEXT DEFAULT '', bpm INTEGER, key TEXT, filename TEXT, plays INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS lessons (id SERIAL PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL, video_url TEXT NOT NULL, order_index INTEGER DEFAULT 0)`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS lesson_progress (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), lesson_id INTEGER NOT NULL REFERENCES lessons(id), quiz_passed INTEGER DEFAULT 0, completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, lesson_id))`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS achievements (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), badge_name TEXT NOT NULL, earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, badge_name))`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS notifications (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), message TEXT NOT NULL, is_read INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  } else {
    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();
    const DB_PATH = path.join(__dirname, 'data.db');
    if (fs.existsSync(DB_PATH)) {
      db = new SQL.Database(fs.readFileSync(DB_PATH));
    } else {
      db = new SQL.Database();
    }
    db.run('PRAGMA journal_mode=WAL');

    db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT NOT NULL, surname TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, gender TEXT, dob TEXT, role TEXT DEFAULT 'user', avatar TEXT DEFAULT 'https://i.pravatar.cc/200?img=32', bio TEXT DEFAULT '', joined_at DATETIME DEFAULT CURRENT_TIMESTAMP, banned INTEGER DEFAULT 0)`);
    db.run(`CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, tag TEXT DEFAULT 'General', likes_count INTEGER DEFAULT 0, comments_count INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id))`);
    db.run(`CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL, user_id INTEGER NOT NULL, content TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (post_id) REFERENCES posts(id), FOREIGN KEY (user_id) REFERENCES users(id))`);
    db.run(`CREATE TABLE IF NOT EXISTS likes (id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL, user_id INTEGER NOT NULL, UNIQUE(post_id, user_id), FOREIGN KEY (post_id) REFERENCES posts(id), FOREIGN KEY (user_id) REFERENCES users(id))`);
    db.run(`CREATE TABLE IF NOT EXISTS uploads (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, title TEXT NOT NULL, genre TEXT DEFAULT 'Other', description TEXT DEFAULT '', tags TEXT DEFAULT '', bpm INTEGER, key TEXT, filename TEXT, plays INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id))`);
    db.run(`CREATE TABLE IF NOT EXISTS lessons (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL, video_url TEXT NOT NULL, order_index INTEGER DEFAULT 0)`);
    db.run(`CREATE TABLE IF NOT EXISTS lesson_progress (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, lesson_id INTEGER NOT NULL, quiz_passed INTEGER DEFAULT 0, completed_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, lesson_id), FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (lesson_id) REFERENCES lessons(id))`);
    db.run(`CREATE TABLE IF NOT EXISTS achievements (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, badge_name TEXT NOT NULL, earned_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id))`);
    db.run(`CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, message TEXT NOT NULL, is_read INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id))`);

    enableAutoSave();
  }

  await seedLessons();
  await seedAdmin();
  if (!usePostgres) saveDatabase();
  return db;
}

async function seedLessons() {
  let count;
  if (usePostgres) {
    const r = await pgPool.query('SELECT COUNT(*) as c FROM lessons');
    count = parseInt(r.rows[0]?.c || '0');
  } else {
    const r = db.exec('SELECT COUNT(*) as c FROM lessons');
    count = (r.length && r[0].values[0][0]) || 0;
  }
  if (count === 0) {
    const lessons = [
      { title: 'Drum Basics', desc: 'Learn stick control, posture, and basic rhythm patterns.', cat: 'Drum', video: '2SUwOgmvzK4', order: 0 },
      { title: 'Beat Timing', desc: 'Improve your timing and learn to stay on beat perfectly.', cat: 'Drum', video: 'P4CsG0VCHlI', order: 1 },
      { title: 'Live Drum Practice', desc: 'Play along with real music and build performance skills.', cat: 'Drum', video: 'kQjMvrIJHH8', order: 2 },
      { title: 'Advanced Grooves', desc: 'Learn professional drum patterns used in modern music.', cat: 'Drum', video: '2cFumWbg3uo', order: 3 },
      { title: 'Drum Warm-Ups', desc: 'Essential warm-up exercises to build speed and control.', cat: 'Drum', video: 'g9_VzNv_lNQ', order: 4 },
      { title: 'Beginner Drum Beats', desc: 'Master 10 essential beginner drum beats that every drummer needs.', cat: 'Drum', video: '7uUOFVkQObw', order: 5 },
      { title: 'Drum Fills & Transitions', desc: 'Learn powerful drum fills to transition between sections smoothly.', cat: 'Drum', video: 'yQ1HwVOrHGE', order: 6 },
      { title: 'Bass Drum Technique', desc: 'Develop strong bass drum foot technique for faster double kicks.', cat: 'Drum', video: 'pG58xTXRHOs', order: 7 },
      { title: 'Jazz Drumming', desc: 'Explore jazz drumming patterns, brush technique, and swing feel.', cat: 'Drum', video: 'uCOIZjjxFJ8', order: 8 },
      { title: 'Drum Solo Fundamentals', desc: 'Build confidence to play drum solos with structure and creativity.', cat: 'Drum', video: 'V1rAcd4Lxn4', order: 9 },
      { title: 'Piano Basics', desc: 'Learn proper hand position, scales, and your first melody.', cat: 'Piano', video: 'UvP1B3J5K4o', order: 0 },
      { title: 'Piano Chords 101', desc: 'Master major and minor chords, inversions, and progressions.', cat: 'Piano', video: '6Qk1y9q0S6E', order: 1 },
      { title: 'Guitar Starter', desc: 'Learn basic chords, strumming patterns, and your first song.', cat: 'Guitar', video: 'akvASiymPEs', order: 0 },
      { title: 'Guitar Fingerpicking', desc: 'Develop fingerpicking technique for folk and acoustic styles.', cat: 'Guitar', video: '4vUOFVj9yG8', order: 1 },
      { title: 'Bass Guitar Foundations', desc: 'Learn bass lines, root notes, and locking with the drummer.', cat: 'Bass', video: 'pB-7oUJ5XlE', order: 0 },
      { title: 'Slap Bass Technique', desc: 'Get started with slap bass techniques used in funk and pop.', cat: 'Bass', video: 'bTKLjbDZhzE', order: 1 },
      { title: 'Vocal Warm-Ups', desc: 'Daily vocal exercises to improve range, tone, and control.', cat: 'Vocals', video: 'oHm4KY5NUmM', order: 0 },
      { title: 'Singing with Emotion', desc: 'Learn to connect emotionally with your audience through your voice.', cat: 'Vocals', video: 'eNZZQH-KuXA', order: 1 },
      { title: 'Saxophone Starter', desc: 'Breath control, embouchure, and your first sax notes.', cat: 'Saxophone', video: '6B4kzMXF5xs', order: 0 },
      { title: 'Music Theory 101', desc: 'Understand notes, scales, keys, and harmony fundamentals.', cat: 'Theory', video: 'rgaTLrZvvk4', order: 0 }
    ];
    if (usePostgres) {
      for (const l of lessons) {
        await pgPool.query('INSERT INTO lessons (title, description, category, video_url, order_index) VALUES ($1,$2,$3,$4,$5)', [l.title, l.desc, l.cat, l.video, l.order]);
      }
    } else {
      const stmt = db.prepare('INSERT INTO lessons (title, description, category, video_url, order_index) VALUES (?, ?, ?, ?, ?)');
      lessons.forEach(l => stmt.run([l.title, l.desc, l.cat, l.video, l.order]));
      stmt.free();
    }
  }
}

async function seedAdmin() {
  if (usePostgres) {
    const admins = await pgPool.query("SELECT COUNT(*) as c FROM users WHERE role = 'admin'");
    if (parseInt(admins.rows[0]?.c || '0') === 0) {
      const bcrypt = require('bcryptjs');
      const hash = bcrypt.hashSync('admin123', 10);
      await pgPool.query("INSERT INTO users (first_name,surname,email,password,role,avatar,bio) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING",
        ['Admin', 'Groove', 'admin@groovelab.com', hash, 'admin', 'https://i.pravatar.cc/200?img=68', 'Platform administrator']);
    }
  } else {
    const admins = db.exec('SELECT COUNT(*) as c FROM users WHERE role = ?', { bind: ['admin'] });
    if (admins.length === 0 || admins[0].values[0][0] === 0) {
      const bcrypt = require('bcryptjs');
      const hash = bcrypt.hashSync('admin123', 10);
      db.run('INSERT OR IGNORE INTO users (first_name, surname, email, password, role, avatar, bio) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['Admin', 'Groove', 'admin@groovelab.com', hash, 'admin', 'https://i.pravatar.cc/200?img=68', 'Platform administrator']);
    }
  }
}

function saveDatabase() {
  if (!usePostgres && db) {
    fs.writeFileSync(path.join(__dirname, 'data.db'), Buffer.from(db.export()));
  }
}

let saveInterval;
function enableAutoSave() {
  if (saveInterval) clearInterval(saveInterval);
  saveInterval = setInterval(saveDatabase, 5000);
}

async function query(sql, params = []) {
  if (usePostgres) {
    try {
      let convertedSql = convertSql(sql);
      let returningSuffix = '';
      if (needsReturning(sql)) returningSuffix = ' RETURNING id';
      const result = await pgPool.query(convertedSql + returningSuffix, params);
      const trimmed = sql.trim().toUpperCase();
      if (trimmed.startsWith('SELECT') || trimmed.startsWith('WITH')) return result.rows;
      const lastInsertId = result.rows?.[0]?.id ?? null;
      return { changes: result.rowCount, lastInsertId };
    } catch (err) {
      console.error('DB Error:', err.message, 'SQL:', sql);
      throw err;
    }
  } else {
    try {
      const stmt = db.prepare(sql);
      if (sql.trim().toUpperCase().startsWith('SELECT') || sql.trim().toUpperCase().startsWith('WITH')) {
        stmt.bind(params);
        const rows = [];
        while (stmt.step()) rows.push(stmt.getAsObject());
        stmt.free();
        return rows;
      } else {
        const result = stmt.run(params);
        stmt.free();
        saveDatabase();
        return { changes: result, lastInsertId: db.exec("SELECT last_insert_rowid() as id")?.[0]?.values?.[0]?.[0] };
      }
    } catch (err) {
      console.error('DB Error:', err.message, 'SQL:', sql);
      throw err;
    }
  }
}

async function get(sql, params = []) {
  const rows = await query(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

async function close() {
  if (saveInterval) clearInterval(saveInterval);
  if (usePostgres) {
    if (pgPool) await pgPool.end();
  } else {
    saveDatabase();
    if (db) db.close();
  }
}

module.exports = { initDatabase, query, get, close };
