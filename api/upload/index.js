// api/upload/index.js
const Busboy = require("busboy");

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
        files.push({
          field: name,
          name: filename || `${name}.bin`,
          contentType: mimeType || "application/octet-stream",
          dataBase64: buffer.toString("base64")
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
    const FLOW_URL = process.env.FLOW_URL;

    if (!FLOW_URL) {
      context.res = { status: 500, body: "FLOW_URL manquant côté serveur." };
      return;
    }

    const { fields, files } = await parseMultipart(req);

    const payload = {
      ...fields,
      submittedAt: new Date().toISOString(),
      files
    };

    const r = await fetch(FLOW_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const txt = await r.text().catch(() => "");
    if (!r.ok) {
      context.res = { status: r.status, body: txt || "Erreur Power Automate" };
      return;
    }

    context.res = { status: 200, body: "OK" };

  } catch (e) {
    context.res = { status: 500, body: `Erreur serveur: ${e.message}` };
  }
};

