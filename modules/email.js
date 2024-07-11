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

async function sendConfirmationEmail(recipient, ref, expires) {
  const expirationStr = new Intl.DateTimeFormat('sl', { timeStyle: 'medium', dateStyle: 'long' }).format(expires);

  await transporter.sendMail({
    from: `"knjižarna 📖" <${process.env.MAIL_USER}>`,
    to: recipient,
    subject: 'potrditev e-poštnega naslova',
    text: `potrdi nov račun! odpri povezavo: http://localhost:3300/registracija?ref=${ref}\npovezava je veljavna do: ${expirationStr}`,
    html: `\
    <div style="font-family:Courier,monospace;">
      <p>potrdi kreiranje računa! klik na
        <a href="http://localhost:3300/registracija?ref=${ref}">link</a> :)
      </p>
      <p style="font-family:Courier,monospace;">povezava je veljavna 24 ur [do: ${expirationStr}]</p>
    </div>`,
  });
}

module.exports = {
  sendConfirmationEmail,
};
