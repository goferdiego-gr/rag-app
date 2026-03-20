const { readSheet, appendRow, getSheets, SHEET_ID } = require('./_sheets');

const cors = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
};

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const { apId } = req.query;
      const rows = await readSheet('servicios!A:I');
      let servicios = rows.slice(1).filter(r => r[0]).map(r => ({
        id: r[0], apId: r[1], fecha: r[2], cliente: r[3],
        m2: parseFloat(r[4]) || 0, producto: r[5],
        litros: parseFloat(r[6]) || 0, notas: r[7] || '', creado_en: r[8]
      }));
      if (apId) servicios = servicios.filter(s => s.apId === apId);
      return res.status(200).json(servicios);
    }

    if (req.method === 'POST') {
      const { apId, fecha, cliente, m2, producto, litros, notas } = req.body;
      if (!apId || !fecha || !cliente || !m2 || !producto || !litros) {
        return res.status(400).json({ error: 'Faltan campos requeridos' });
      }
      const id = 'svc' + Date.now();
      const creado_en = new Date().toISOString();
      await appendRow('servicios', [id, apId, fecha, cliente, m2, producto, litros, notas || '', creado_en]);

      const apRows = await readSheet('aplicadores!A:G');
      const apIndex = apRows.findIndex(r => r[0] === apId);
      if (apIndex > 0) {
        const ap = apRows[apIndex];
        const nuevasCompras = (parseFloat(ap[5]) || 0) + (parseFloat(litros) * 120);
        const nuevoNivel = getNivel(nuevasCompras);
        const sheets = await getSheets();
        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: `aplicadores!E${apIndex + 1}:F${apIndex + 1}`,
          valueInputOption: 'RAW',
          requestBody: { values: [[nuevoNivel, nuevasCompras]] }
        });
      }

      return res.status(200).json({ ok: true, id });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
};

function getNivel(compras) {
  if (compras >= 30000) return 'socio';
  if (compras >= 15000) return 'master';
  if (compras >= 5000) return 'verde';
  return 'semilla';
}
