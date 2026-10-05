// utils/sqliteSessionStore.js
// เก็บ session ลงตาราง sessions ใน SQLite เดิมของระบบ (ไม่ต้องติดตั้งแพ็กเกจเพิ่ม)
// ทำให้ผู้ใช้ที่ติ๊ก "จำฉันไว้ในระบบ" ยังล็อกอินอยู่แม้ server ถูกรีสตาร์ท
const session = require('express-session');

const DEFAULT_TTL_MS = 1000 * 60 * 60 * 8;

class SqliteSessionStore extends session.Store {
  constructor(db) {
    super();
    this.db = db;
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid     TEXT PRIMARY KEY,
        sess    TEXT NOT NULL,
        expires INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);
    `);
    this.stmts = {
      get: db.prepare('SELECT sess, expires FROM sessions WHERE sid = ?'),
      set: db.prepare('INSERT INTO sessions (sid, sess, expires) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires = excluded.expires'),
      del: db.prepare('DELETE FROM sessions WHERE sid = ?'),
      touch: db.prepare('UPDATE sessions SET expires = ? WHERE sid = ?'),
      purge: db.prepare('DELETE FROM sessions WHERE expires < ?')
    };
    this.stmts.purge.run(Date.now());
    setInterval(() => { try { this.stmts.purge.run(Date.now()); } catch (e) { /* ignore */ } }, 60 * 60 * 1000).unref();
  }

  _expiry(sess) {
    const e = sess && sess.cookie && sess.cookie.expires;
    const t = e ? new Date(e).getTime() : NaN;
    return Number.isFinite(t) ? t : Date.now() + DEFAULT_TTL_MS;
  }

  get(sid, cb) {
    try {
      const row = this.stmts.get.get(sid);
      if (!row) return cb(null, null);
      if (row.expires < Date.now()) { this.stmts.del.run(sid); return cb(null, null); }
      cb(null, JSON.parse(row.sess));
    } catch (err) { cb(err); }
  }

  set(sid, sess, cb) {
    try { this.stmts.set.run(sid, JSON.stringify(sess), this._expiry(sess)); cb && cb(null); }
    catch (err) { cb && cb(err); }
  }

  touch(sid, sess, cb) {
    try { this.stmts.touch.run(this._expiry(sess), sid); cb && cb(null); }
    catch (err) { cb && cb(err); }
  }

  destroy(sid, cb) {
    try { this.stmts.del.run(sid); cb && cb(null); }
    catch (err) { cb && cb(err); }
  }
}

module.exports = SqliteSessionStore;
