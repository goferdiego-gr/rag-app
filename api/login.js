const { readSheet } = require('./_sheets');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { usuario, password } = req.body;
    const rows = await readSheet('usuarios!A:F');
    const users = rows.slice(1).map(r => ({
      id: r[0], usuario: r[1], password: r[2],
      rol: r[3], aplicador_id: r[4], nombre: r[5]
    }));

    const user = users.find(u => u.usuario === usuario && u.password === password);
    if (!user) return res.status(401).json({ error: 'Usuario o contrasena incorrectos' });

    let aplicador = null;
    if (user.rol === 'aplicador' && user.aplicador_id) {
      const apRows = await readSheet('aplicadores!A:G');
      const ap = apRows.slice(1).find(r => r[0] === user.aplicador_id);
      if (ap) aplicador = {
        id: ap[0], nombre: ap[1], zona: ap[2],
        perfil: ap[3], nivel: ap[4], compras_mes: parseFloat(ap[5]) || 0, usuario: ap[6]
      };
    }

    return res.status(200).json({
      ok: true,
      user: { id: user.id, usuario: user.usuario, rol: user.rol, nombre: user.nombre },
      aplicador
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Error del servidor: ' + e.message });
  }
};
