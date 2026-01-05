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
        const buffer = Buffer.concat(chunks);

        // Ignore les "fichiers vides" (champ laissé vide côté client)
        if (!buffer || buffer.length === 0) return;

        files.push({
          field: name,
          filename: filename || `${name}.bin`,
          contentType: mimeType || "application/octet-stream",
          buffer,
        });
      });
    });

    busboy.on("finish", () => resolve({ fields, files }));
    busboy.on("error", reject);

    busboy.end(req.body);
  });
}

function fmtDateFR(isoDate) {
  // attend "YYYY-MM-DD" (input type=date)
  if (!isoDate) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return isoDate;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

module.exports = async function (context, req) {
  try {
    const SMTP_USER = process.env.SMTP_USER;
    const SMTP_PASS = process.env.SMTP_PASS;
    const MAIL_TO   = process.env.MAIL_TO;
    const MAIL_CC   = process.env.MAIL_CC || "";

    if (!SMTP_USER || !SMTP_PASS || !MAIL_TO) {
      context.res = { status: 500, body: "Config manquante (SMTP_USER/SMTP_PASS/MAIL_TO)." };
      return;
    }

    const { fields, files } = await parseMultipart(req);

    // Limite totale (évite erreurs O365 sur pièces jointes)
    const totalBytes = files.reduce((s, f) => s + f.buffer.length, 0);
    const maxTotal = 18 * 1024 * 1024; // ~18 MB
    if (totalBytes > maxTotal) {
      context.res = { status: 413, body: "Pièces jointes trop lourdes (max ~18 Mo)." };
      return;
    }

    // Champs (version Netlify-like)
    const date_expertise = (fields.date_expertise || "").trim(); // "YYYY-MM-DD"
    const nom = (fields.nom || "").trim();
    const email = (fields.email || "").trim();
    const telephone = (fields.telephone || "").trim();
    const adresse = (fields.adresse_postale || "").trim();
    const immat = (fields.immatriculation || "").trim();

    const subject = `[ONBOARDING] ${nom || "Client"}${immat ? " - " + immat : ""}`;

    // Comptage des photos par catégorie
    const countByPrefix = (prefix) =>
      files.filter(f => (f.field || "").startsWith(prefix)).length;

    const nbCarteGrise = files.filter(f => f.field === "carte_grise").length;
    const nbDegats = countByPrefix("degat_");
    const nbHorsSinistre = countByPrefix("hors_sinistre_");
    const totalFiles = files.length;

    const bodyText =
`Nouveau dossier onboarding

Date RDV expertise : ${fmtDateFR(date_expertise) || "(non renseignée)"}

Nom              : ${nom}
Email            : ${email}
Téléphone        : ${telephone}
Adresse          : ${adresse}
Immatriculation  : ${immat || "(non renseignée)"}

Pièces jointes :
- Carte grise        : ${nbCarteGrise}
- Dégâts (degat_*)   : ${nbDegats}
- Hors sinistre      : ${nbHorsSinistre}
- Total              : ${totalFiles}

Date de soumission : ${new Date().toISOString()}
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
