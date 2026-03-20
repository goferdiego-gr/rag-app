const { readSheet, appendRow } = require('./_sheets');

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
      const rows = await readSheet('aplicadores!A:G');
      const aplicadores = rows.slice(1).filter(r => r[0]).map(r => ({
        id: r[0], nombre: r[1], zona: r[2], perfil: r[3],
        nivel: r[4], compras_mes: parseFloat(r[5]) || 0, usuario: r[6]
      }));
      return res.status(200).json(aplicadores);
    }

    if (req.method === 'POST') {
      const { nombre, zona, perfil, usuario, password } = req.body;
      if (!nombre || !usuario || !password) {
        return res.status(400).json({ error: 'Faltan campos requeridos' });
      }
      const id = 'ap' + Date.now();
      const uid = 'u' + Date.now();
      await appendRow('aplicadores', [id, nombre, zona || '', perfil || '', 'semilla', 0, usuario]);
      await appendRow('usuarios', [uid, usuario, password, 'aplicador', id, nombre]);
      return res.status(200).json({ ok: true, id });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
};
