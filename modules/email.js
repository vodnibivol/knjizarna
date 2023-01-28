const nodemailer = require('nodemailer');
const dotenv = require('dotenv');

dotenv.config();

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: 465,
  secure: true, // true for 465, false for other ports
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

async function sendConfirmationEmail(recipient, hash, expires) {
  const expirationStr = new Intl.DateTimeFormat('sl', { timeStyle: 'medium', dateStyle: 'long' }).format(expires);

  await transporter.sendMail({
    from: '"vodnibivol 📖" <test@vodnibivol.org>',
    to: recipient,
    subject: 'potrditev e-poštnega naslova',
    text: `potrdi nov račun! odpri povezavo: http://localhost:3000/registracija?ref=${hash}\npovezava je veljavna do: ${expirationStr}`, // plain text
    html: `\
    <div style="font-family:Courier,monospace;">
      <p>potrdi kreiranje računa! klik na
        <a href="http://localhost:3000/registracija?ref=${hash}">link</a> :)
      </p>
      <p style="font-family:Courier,monospace;">povezava je veljavna 24 ur [do: ${expirationStr}]</p>
    </div>`, // html version
  });
}

module.exports = {
  sendConfirmationEmail,
};
