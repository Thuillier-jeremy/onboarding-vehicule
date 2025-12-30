module.exports = async function (context, req) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  const method = (req.method || "").toUpperCase();

  if (method === "OPTIONS") {
    context.res = { status: 204, headers: corsHeaders, body: "" };
    return;
  }

  context.res = {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    body: { ok: true, message: "upload endpoint is alive", method }
  };
};
