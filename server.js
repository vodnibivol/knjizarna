const express = require('express');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const fileUpload = require('express-fileupload');
const cookieParser = require('cookie-parser');

const { DB } = require('./modules/db');
const { digest, formatBytes } = require('./modules/utils');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.use(bodyParser.json()); // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({ extended: true }));
app.use(fileUpload());
app.use(cookieParser());

DB.load();

// NOTE: check for missing entries at server start
DB.entries.map((e) => e.id).forEach((id) => DB.checkMissing(id));

// --- ROUTES

app.use('/public', express.static('public'));

app.get('/', [checkAdmin, getMsg], (req, res) => {
  res.render('pages/domov', { title: 'domov' });
});

app.get('/iskanje', [checkAdmin, getMsg], (req, res) => {
  const results = DB.search(req.query.q, res.locals.isAdmin);
  results.forEach((r) => (r.sizeStr = formatBytes(r.size))); // format bytes
  res.render('pages/iskanje', { title: 'iskanje', query: req.query.q, results });
});

app.get('/tekst/:id', [checkAdmin, getMsg], (req, res, next) => {
  const { id } = req.params;
  const entry = DB.get(id);

  const referrer = req.get('Referrer');
  const prev = referrer && /iskanje/.test(new URL(referrer).pathname);

  if (entry) {
    entry.sizeStr = formatBytes(entry.size);
    res.render('pages/tekst', { title: entry.naslov, entry, prev });
  } else {
    next();
  }
});

app.get('/view/:id', (req, res, next) => {
  const { id } = req.params;

  const fpath = path.resolve(__dirname, 'public', 'pdf', id + '.pdf');

  if (Math.random() < 0.2) return res.sendFile(path.resolve(__dirname, 'public', 'img', 'db.png'));
  if (!fs.existsSync(fpath)) return next();
  res.sendFile(fpath);
});

app.get('/novo', [checkAdmin, getMsg], (req, res) => {
  res.render('pages/novo', { entry: {} });
});

app.get('/uredi/:id', [checkAdmin, getMsg], (req, res) => {
  const entry = DB.get(req.params.id);

  const referrer = req.get('Referrer');
  const prev = referrer && /tekst/.test(new URL(referrer).pathname);

  res.render('pages/novo', { entry, prev });
});

app.get('/prijava', [checkAdmin, getMsg], (req, res) => {
  res.render('pages/prijava');
});

app.get('/odjava', [checkAdmin, getMsg], (req, res) => {
  res.clearCookie('login');
  res.redirect('/?msg=' + encodeURIComponent('vade in pace!'));
});

// --- MIDDLEWARE FUNCTIONS

function checkAdmin(req, res, next) {
  const isAdmin = req.cookies?.login === 'a3fe8133ca9cfa0f59fdd6bafb489457e3ac49e36cdebe62f288894b07f9f515';
  res.locals.isAdmin = isAdmin;
  next();
}

function getMsg(req, res, next) {
  const msg = req.query?.msg;
  res.locals.msg = msg ? { text: msg } : null;
  next();
}

// --- API

app.post('/publish', (req, res) => {
  const data = req.body;

  if (req.files) {
    // if uploading file
    const file = req.files.doc;

    data.id = data.id || DB.newId(); // NOTE: vedno mora bit svoj id in ne md5!

    const filename = data.id + '.pdf';
    const pathname = path.resolve(__dirname, 'public', 'pdf', filename);

    file.mv(pathname, function (err) {
      if (err) return res.status(500).send(err);

      // SUCCESS => change entry in database
      data.size = file.size;
      data.md5 = file.md5;
      data.originalFilename = file.name;
      data.filename = filename;

      // TODO: preveri, ali je sync ali async (in kaj lahko popraviš)
      DB.update(data);
      DB.checkMissing(data.id);
      checkDuplicates(); // TODO: to ni DB, checkMissing pa je ??
      res.redirect('/tekst/' + data.id);
    });
  } else {
    DB.update(data);
    res.redirect('/tekst/' + data.id);
  }
});

app.get('/delete/:id', checkAdmin, (req, res) => {
  const entry = DB.get(req.params.id);

  DB.delete(req.params.id, res.locals.isAdmin);
  checkDuplicates();

  const msg = encodeURIComponent('izbrisano: ' + entry.naslov);
  res.redirect('/iskanje?msg=' + msg);
});

app.post('/prijava', (req, res) => {
  const { usr, pwd } = req.body;
  if (usr === 'male' && pwd === 'muce') {
    const hash = digest(usr + pwd);
    res.cookie('login', hash);
    res.redirect('/?msg=' + encodeURIComponent('salve!'));
  } else {
    res.redirect('/prijava?msg=' + encodeURIComponent('napačni podatki.'));
  }
});

// --- HANDLES

app.get('/checkduplicates', (req, res) => {
  // NOTE: also flags them!
  res.json(checkDuplicates());
});

function checkDuplicates() {
  // checks for duplicates and flags them
  const duplicates = [];

  DB.entries.forEach((e1) => {
    const isDuplicate = DB.entries.some((e2) => e1 !== e2 && e1.md5 === e2.md5);
    if (isDuplicate) {
      e1.flags.duplicate = true;
      duplicates.push(e1.id);
    } else {
      delete e1.flags.duplicate;
    }
  });
  DB.save();

  return duplicates;
}

// app.get('/changeids', (req, res) => {
//   // FIXME: DOSTI BOLJSE JE, DA SE TO NAREDI POSEBEJ!!! VELIKO DELA, CE SE IZBRISE
//   const result = [];

//   DB.entries.forEach((e) => {
//     // change id
//     const newId = DB.newId();

//     // rename file
//     const oldFile = path.resolve(__dirname, 'public', 'pdf', e.filename);
//     const newFile = path.resolve(__dirname, 'public', 'pdf', newId + '.pdf');

//     try {
//       fs.renameSync(oldFile, newFile);
//       result.push(`success: ${e.id} => ${newId}`);
//       e.id = newId;
//       e.filename = newId + '.pdf';
//     } catch (error) {
//       result.push(`error: ${e.id}`);
//     }
//   });

//   DB.save();
//   res.json(result.sort());
// });

// app.get('/cleandb', (req, res) => {
//   // FIXME: NAJPREJ PROBAJ Z ENIM!
//   const ok = [];
//   const notOk = [];

//   const dirpath = path.resolve(__dirname, 'public', 'pdf');
//   const files = fs.readdirSync(dirpath).filter((fname) => fname.includes('.pdf'));

//   files.forEach((fname) => {
//     const id = fname.match(/(.*)\.pdf/)[1];
//     if (!!DB.get(id)) {
//       ok.push(fname);
//     } else {
//       notOk.push(fname);
//       // fs.unlinkSync(path.resolve(dirpath, fname));
//     }
//   });
//   res.json({ ok, notOk });
// });

// --- 404

app.use('*', checkAdmin, (req, res) => {
  res.render('pages/404');
});

app.listen(PORT, () => console.log('listening on port: ' + PORT));
