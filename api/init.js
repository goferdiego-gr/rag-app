const { initSheets } = require('./_sheets');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();
  try {
    await initSheets();
    return res.status(200).json({ ok: true, message: 'Sheet inicializado correctamente' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
