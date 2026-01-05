const Busboy = require("busboy");
const nodemailer = require("nodemailer");

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers });
    const fields = {};
    const files = [];

    busboy.on("field", (name, val) => {
      fields[name] = val;
    });

    busboy.on("file", (name, file, info) => {
      const { filename, mimeType } = info;
      const chunks = [];
      file.on("data", (d) => chunks.push(d));
      file.on("end", () => {
        files.push({
          field: name,
          filename: filename || `${name}.bin`,
          contentType: mimeType || "application/octet-stream",
          buffer: Buffer.concat(chunks),
        });
      });
    });

    busboy.on("finish", () => resolve({ fields, files }));
    busboy.on("error", reject);
    busboy.end(req.body);
  });
}

module.exports = async function (context, req) {
  try {
    const SMTP_USER = process.env.SMTP_USER;
    const SMTP_PASS = process.env.SMTP_PASS;
    const MAIL_TO   = process.env.MAIL_TO;   // destinataire (ex: boite onboarding)
    const MAIL_CC   = process.env.MAIL_CC || "";

    if (!SMTP_USER || !SMTP_PASS || !MAIL_TO) {
      context.res = { status: 500, body: "Config manquante (SMTP_USER/SMTP_PASS/MAIL_TO)." };
      return;
    }

    const { fields, files } = await parseMultipart(req);

    // limite totale (évite erreurs O365 sur pièces jointes)
    const totalBytes = files.reduce((s, f) => s + f.buffer.length, 0);
    const maxTotal = 18 * 1024 * 1024; // ~18 MB
    if (totalBytes > maxTotal) {
      context.res = { status: 413, body: "Pièces jointes trop lourdes (max ~18 Mo)." };
      return;
    }

    const nom = (fields.nom || "").trim();
    const email = (fields.email || "").trim();
    const telephone = (fields.telephone || "").trim();
    const adresse = (fields.adresse_postale || "").trim();
    const immat = (fields.immatriculation || "").trim();

    const subject = `[ONBOARDING] ${nom || "Client"}${immat ? " - " + immat : ""}`;

    const bodyText =
`Nouveau dossier onboarding

Nom: ${nom}
Email: ${email}
Téléphone: ${telephone}
Adresse: ${adresse}
Immatriculation: ${immat}

Date: ${new Date().toISOString()}
`;

    const transporter = nodemailer.createTransport({
      host: "smtp.office365.com",
      port: 587,
      secure: false,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    const attachments = files.map(f => ({
      filename: `${f.field}_${f.filename}`,
      content: f.buffer,
      contentType: f.contentType,
    }));

    await transporter.sendMail({
      from: SMTP_USER,
      to: MAIL_TO,
      cc: MAIL_CC || undefined,
      replyTo: email || undefined,
      subject,
      text: bodyText,
      attachments,
    });

    context.res = { status: 200, body: "OK" };
  } catch (e) {
    context.res = { status: 500, body: `Erreur serveur: ${e.message}` };
  }
};
