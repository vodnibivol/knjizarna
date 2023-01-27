const path = require('path');
const fs = require('fs');
const { digest } = require('./utils');

const DB_DIR = path.resolve(__dirname, '..', 'public', 'pdf');

const DB = {
  entries: [],
  dbFilepath: path.resolve(DB_DIR, 'db.json'),

  newId() {
    let id;
    while (!id || this.entries.some((e) => e.id === id)) {
      id = digest('' + Math.random()).substring(0, 5);
    }
    return id;
  },

  get(id) {
    return this.entries.find((e) => e.id === id);
  },

  getByHash(hash) {
    return this.entries.find((e) => e.md5 === hash);
  },

  getAll() {
    return this.entries;
  },

  update(entry) {
    entry.modified = new Date().toISOString();

    const e = this.get(entry?.id);
    if (e) {
      this.entries[this.entries.indexOf(e)] = { ...e, ...entry };
    } else {
      entry.created = entry.modified;
      this.entries.push(entry);
    }
    this.save();
  },

  delete(id, trulyDelete = false) {
    const entry = this.entries.find((e) => e.id === id);
    if (true || trulyDelete) {
      // NOTE !! ALWAYS DELETE EVERYTHING
      // delete from db && also delete file
      fs.unlinkSync(path.resolve(DB_DIR, entry.filename));
      this.entries = this.entries.filter((e) => e.id !== id); // delete from db (but not the file!)
    } else {
      entry.flags = entry.flags || {};
      entry.flags.deleted = true;
    }
    this.save();
  },

  checkMissing(id) {
    const entry = this.get(id);
    const exists = fs.existsSync(path.resolve(DB_DIR, entry.filename));

    entry.flags = entry.flags || {};
    if (!exists) {
      entry.flags.missing = true;
    } else {
      delete entry.flags.missing;
    }
    return !exists;
  },

  search(query, showAll = false) {
    const reg = new RegExp(query, 'i');
    const results = this.entries
      .filter((e) => {
        // if (e.flags?.deleted && !showAll) return false;
        return reg.test(e.avtor) || reg.test(e.naslov) || reg.test(e.id) || reg.test(e.letnica) || reg.test(e.md5);
      })
      .sort((a, b) => (a.avtor + a.naslov).localeCompare(b.avtor + b.naslov));

    return results;
  },

  save() {
    fs.writeFileSync(this.dbFilepath, JSON.stringify(this.entries));
  },

  load() {
    this.entries = JSON.parse(fs.readFileSync(this.dbFilepath));
  },
};

// --- CLASS

class Database {
  /**
   * structure:
   * ROOT/ (db/) <-- ROOT DIR
   *   |- <db1Name>/ (pdf/)
   *   |- <dn1Name>.json (pdf.json) <-- DATABASE
   *   |- <db2Name>/ (users/)
   *   |- <dn2Name>.json (users.json)
   *   |- ...
   */

  constructor(dbName, rootDir) {
    if (!dbName || !rootDir) throw new Error('db name and root dir must be provided.');

    this.rootDir = rootDir; // FULL PATH (__dir + ..)
    this.dbName = dbName;
    this.entries = [];

    this._init();
  }

  _init() {
    if (!fs.existsSync(this.rootDir)) {
      fs.mkdirSync(this.rootDir, { recursive: true });
    }

    this.dbPath = path.resolve(this.rootDir, this.dbName + '.json');
    if (!fs.existsSync(this.dbPath)) {
      fs.writeFileSync(this.dbPath, '[]', { recursive: true });
    }

    this._load();
  }

  newId() {
    let id;
    while (!id || this.entries.some((e) => e.id === id)) {
      id = digest('' + Math.random()).substring(0, 5);
    }
    return id;
  }

  get(id) {
    return this.entries.find((e) => e.id === id);
  }

  getByHash(hash) {
    return this.entries.find((e) => e.md5 === hash);
  }

  getAll() {
    return this.entries;
  }

  update(entry) {
    entry.modified = new Date().toISOString();

    const e = this.get(entry?.id);
    if (e) {
      this.entries[this.entries.indexOf(e)] = { ...e, ...entry };
    } else {
      entry.created = entry.modified;
      this.entries.push(entry);
    }
    this._save();
  }

  delete(id, trulyDelete = false) {
    const entry = this.entries.find((e) => e.id === id);
    if (true || trulyDelete) {
      // NOTE !! ALWAYS DELETE EVERYTHING
      // delete from db && also delete file
      fs.unlinkSync(path.resolve(DB_DIR, entry.filename));
      this.entries = this.entries.filter((e) => e.id !== id); // delete from db (but not the file!)
    } else {
      entry.flags = entry.flags || {};
      entry.flags.deleted = true;
    }
    this._save();
  }

  checkMissing(id) {
    const entry = this.get(id);
    const exists = fs.existsSync(path.resolve(DB_DIR, entry.filename));

    entry.flags = entry.flags || {};
    if (!exists) {
      entry.flags.missing = true;
    } else {
      delete entry.flags.missing;
    }
    return !exists;
  }

  search(query, showAll = false) {
    const reg = new RegExp(query, 'i');
    const results = this.entries
      .filter((e) => {
        // if (e.flags?.deleted && !showAll) return false;
        return reg.test(e.avtor) || reg.test(e.naslov) || reg.test(e.id) || reg.test(e.letnica) || reg.test(e.md5);
      })
      .sort((a, b) => (a.avtor + a.naslov).localeCompare(b.avtor + b.naslov));

    return results;
  }

  _save() {
    fs.writeFileSync(this.dbPath, JSON.stringify(this.entries));
  }

  _load() {
    this.entries = JSON.parse(fs.readFileSync(this.dbPath));
  }
}

module.exports = { DB, Database };
