const { supabase, cors } = require('./_supabase');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { usuario, password } = req.body;
    const { data, error } = await supabase
      .from('usuarios').select('*')
      .eq('usuario', usuario).eq('password', password).eq('activo', true).single();
    if (error || !data) return res.status(401).json({ error: 'Usuario o contrasena incorrectos' });
    const { password: _, ...user } = data;
    return res.status(200).json({ ok: true, user });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
