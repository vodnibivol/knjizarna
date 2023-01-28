const express = require('express');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const fileUpload = require('express-fileupload');
const cookieParser = require('cookie-parser');
const Datastore = require('@seald-io/nedb');

// const { DB } = require('./modules/db');
const { digest, formatBytes } = require('./modules/utils');
const { sendConfirmationEmail } = require('./modules/email');

const app = express();
const PORT = process.env.PORT || 3000;

app.use('/public', express.static('public'));
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json()); // to support JSON-encoded bodies
app.use(fileUpload());
app.use(cookieParser());

const db = {};

db.users = new Datastore({ filename: path.resolve(__dirname, 'db', 'users.db'), autoload: true });
db.refs = new Datastore({ filename: path.resolve(__dirname, 'db', 'refs.db'), autoload: true });
db.sessions = new Datastore({ filename: path.resolve(__dirname, 'db', 'sessions.db'), autoload: true });
db.files = new Datastore({ filename: path.resolve(__dirname, 'db', 'files.db'), autoload: true });

checkDuplicates();

// --- ROUTES

app.get('/', [checkLogin, getMsg], (req, res) => {
  res.render('pages/domov', { title: 'domov' });
});

app.get('/iskanje', [checkLogin, getMsg], async (req, res) => {
  const reg = new RegExp(req.query.q, 'i');
  const results = await db.files.find({
    $or: [
      { author: { $regex: reg } },
      { title: { $regex: reg } },
      { md5: { $regex: reg } },
      { id: { $regex: reg } },
      { publisher: { $regex: reg } },
    ],
  });

  results.forEach((r) => (r.sizeStr = formatBytes(r.size))); // format bytes
  res.render('pages/iskanje', { title: 'iskanje', query: req.query.q, results });
});

app.get('/tekst/:id', [checkLogin, getMsg], async (req, res, next) => {
  const { id } = req.params;

  const entry = await db.files.findOne({ id });

  const referrer = req.get('Referrer');
  const prev = referrer && /iskanje/.test(referrer);

  if (entry) {
    entry.sizeStr = formatBytes(entry.size);
    return res.render('pages/tekst', { title: entry.naslov, entry, prev });
  }

  // entry does not exist
  next();
});

app.get('/ogled/:id', async (req, res, next) => {
  const { id } = req.params;

  const file = await db.files.findOne({ id });
  if (file) {
    const fpath = path.resolve(__dirname, 'db', 'pdf', file.filename);
    if (!fs.existsSync(fpath)) return next();
    // if (Math.random() < 0.2) return res.sendFile(path.resolve(__dirname, 'public', 'img', 'db.png'));
    return res.sendFile(fpath);
  }

  // entry does not exist in database
  next();
});

app.get('/novo', [checkLogin, getMsg], (req, res) => {
  if (!res.locals.user) {
    return res.redirect('/prijava?msg=' + encodeURIComponent('za objavo se prijavite:)'));
  }
  res.render('pages/novo', { entry: {} });
});

app.get('/uredi/:id', [checkLogin, getMsg], async (req, res) => {
  const entry = await db.files.findOne({ id: req.params.id });

  const referrer = req.get('Referrer');
  const prev = referrer && /tekst/.test(new URL(referrer).pathname);

  res.render('pages/novo', { entry, prev });
});

// --- MIDDLEWARE FUNCTIONS

async function checkLogin(req, res, next) {
  res.locals.user = null;
  res.locals.session = null;

  const login = req.cookies?.login; // USR;SESSION_ID

  if (!login) return next();

  const [usr, sessionId] = login.split(';');
  const session = await db.sessions.findOne({ usr, session: sessionId });

  if (!session) return next();

  res.locals.user = await db.users.findOne({ usr });
  res.locals.session = session;

  next();
}

function getMsg(req, res, next) {
  const msg = req.query?.msg;
  res.locals.msg = msg ? { text: msg } : null;
  next();
}

// --- API

app.post('/publish', checkLogin, async (req, res) => {
  let info = {
    id: req.body.id,
    author: req.body.author,
    title: req.body.title,
    year: req.body.year,
    publisher: req.body.publisher,
    place: req.body.place,
    description: req.body.description,
  };

  // FIRST TIME: uploading file
  if (req.files) {
    const file = req.files.doc;
    const id = await (async function () {
      const ids = (await db.files.find({})).map((d) => d.id);
      let newId = digest('' + Math.random()).substring(0, 5);
      while (ids.includes(newId)) {
        newId = digest('' + Math.random()).substring(0, 5);
      }
      return newId;
    })();

    info = {
      ...info,
      id,

      size: file.size,
      md5: file.md5,
      filename: id + '.pdf',
      originalFilename: file.name,

      uploadedBy: res.locals.user.usr,
      flags: {},
    };

    const pathname = path.resolve(__dirname, 'db', 'pdf', info.filename);

    file.mv(pathname, async function (err) {
      if (err) return res.status(500).send(err);
      await db.files.insert(info);
      checkDuplicates();
      return res.redirect('/tekst/' + info.id);
    });
  } else {
    await db.files.update({ id: info.id }, { $set: info });
    res.redirect('/tekst/' + info.id);
  }
});

app.get('/delete/:id', checkLogin, async (req, res) => {
  const entry = await db.files.findOne({ id: req.params.id });

  fs.unlinkSync(path.resolve(__dirname, 'db', 'pdf', entry.filename));
  await db.files.remove({ id: req.params.id });
  checkDuplicates();

  const msg = encodeURIComponent('izbrisano: ' + entry.title); // + entry.naslov
  res.redirect('/?msg=' + msg);
});

// --- UPORABNIKI IN PRIJAVA

app.get('/prijava', [checkLogin, getMsg], (req, res) => {
  res.render('pages/prijava');
});

app.get('/odjava', [checkLogin, getMsg], async (req, res) => {
  const removedNo = await db.sessions.removeAsync({ session: res.locals.session.session });
  console.log(`removed ${removedNo} session documents.`);

  // res.clearCookie('login'); // niti ni potrebno ..
  res.redirect('/prijava/?msg=' + encodeURIComponent('vade in pace!'));
});

app.post('/prijava', async (req, res) => {
  const { usr, pwd } = req.body;

  const user = await db.users.findOne({ $or: [{ usr }, { email: usr }] });
  if (user) {
    if (user.pwd === digest(pwd)) {
      // login ok! => add cookie with "USR;SESSION_ID"
      const session = digest('' + Math.random());
      await db.sessions.insert({ usr: user.usr, session });

      res.cookie('login', user.usr + ';' + session);
      return res.redirect('/?msg=' + encodeURIComponent('salve!'));
    }

    // uporabnik obstaja, toda napačno geslo
    return res.redirect('/prijava?msg=' + encodeURIComponent('napačno geslo'));
  }

  // uporabnik ne obstaja
  return res.redirect('/prijava?msg=' + encodeURIComponent('uporabnik ne obstaja ..'));
});

app.get('/registracija', [checkLogin, getMsg], async (req, res) => {
  // --- gumb "registracija" || email link
  const { ref } = req.query;

  if (!ref) {
    // reference not provided: send file with email field
    return res.render('pages/sendmail');
  }

  // email link clicked
  const entry = await db.refs.findOne({ ref, expires: { $gt: new Date().valueOf() } });

  if (!entry) {
    // reference not valid
    return res.redirect('/registracija?msg=' + encodeURIComponent('referenca ne obstaja .. poskusi ponovno'));
  }

  // reference valid, but user with email already exists
  const user = await db.users.findOne({ email: entry.email });
  if (user) {
    return res.redirect('/prijava?msg=' + encodeURIComponent('uporabnik s tem e-poštnim naslovom že obstaja.'));
  }

  // koncno je vse ok. render stran, kjer se lahko registrira.
  return res.render('pages/registracija', { email: entry.email, ref, usr: '' });
});

app.post('/confirmemail', async (req, res) => {
  // AJAX pri registraciji .. POŠLJE EMAIL
  const { email } = req.body;

  // if user with email exists: redirect to login
  const user = await db.users.findOne({ email });
  if (user) {
    return res.json({ msg: 'uporabnik s tem e-poštnim naslovom že obstaja.', status: 'error' });
  }

  // generate hash and save to database (hash: email)
  const ref = digest('' + Math.random());
  const expires = new Date().valueOf() + 24 * 60 * 60 * 1000; // FIXME: 1 day

  try {
    await sendConfirmationEmail(email, ref, expires);
    await db.refs.insert({ ref, email, expires });
    console.log('msg sent');
    return res.json({ msg: 'sporočilo uspešno poslano!', status: 'ok' });
  } catch (err) {
    return res.json({ msg: 'neznana napaka ..', status: 'error' });
  }
});

app.post('/registracija', checkLogin, async (req, res) => {
  // registration form filled. user clicked on "registriraj" button
  const { usr, pwd, pwdCheck, ref } = req.body;

  const entry = await db.refs.findOne({ ref, expires: { $gt: new Date().valueOf() } });
  if (!entry) return res.redirect('/registracija?msg=' + encodeURIComponent('poskusi ponovno.')); // ref ni ok ..

  const { email } = entry;

  // check if email taken (user has already registered)
  const emailEntry = await db.users.findOne({ email });
  if (emailEntry) {
    return res.redirect('/prijava?msg=' + encodeURIComponent('uporabnik s tem email naslovom že obstaja.'));
  }

  // check if username taken
  const existUser = await db.users.findOne({ usr }); // user with same username
  if (existUser) {
    return res.render('pages/registracija', { email, usr, ref, msg: `uporabniško ime '${usr}' je žal zasedeno:(` });
  }

  // mail ok, username ok, check password
  if (pwd.length < 6) {
    return res.render('pages/registracija', { email, usr, ref, msg: 'geslo je prešibko. vsaj 6 znakov ..' });
  } else if (pwd !== pwdCheck) {
    return res.render('pages/registracija', { email, usr, ref, msg: 'gesli se ne ujemata.' });
  }

  // mail ok, username free, password is ok => CREATE USER
  await db.users.insert({ usr, email, pwd: digest(pwd) });
  res.redirect('/prijava?msg=' + encodeURIComponent('uspešna registracija!'));
});

// NOTE: HERE

// --- HANDLES

app.get('/checkduplicates', async (req, res) => {
  // NOTE: also flags them!
  res.json(await checkDuplicates());
});

async function checkDuplicates() {
  // checks for duplicates and flags them

  const entries = await db.files.find({});
  const duplicates = entries.filter((e) => entries.some((e2) => e !== e2 && e.md5 === e2.md5)).map((e) => e.id);

  await db.files.update({ id: { $in: duplicates } }, { $set: { flags: { duplicate: true } } }, { multi: true });
  await db.files.update({ id: { $nin: duplicates } }, { $unset: { flags: { duplicate: false } } }, { multi: true });
  return duplicates;
}

// --- ERRORS

app.use('*', checkLogin, (req, res) => {
  res.render('pages/404');
});

app.use((err, req, res, next) => {
  console.error(err);
  res.end('error 500');
});

app.listen(PORT, () => console.log('listening on port: ' + PORT));
