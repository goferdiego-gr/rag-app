const { supabase, cors } = require('./_supabase');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    if (req.method === 'GET') {
      const { id } = req.query;
      if (id) {
        const { data, error } = await supabase.from('usuarios')
          .select('id,usuario,rol,nombre,apellidos,empresa,email,telefono,ciudad,nivel,compras_mes,comision_pct,activo,creado_en,referido_por')
          .eq('id', id).single();
        if (error) throw error;
        return res.status(200).json(data);
      }
      const { data, error } = await supabase.from('usuarios')
        .select('id,usuario,rol,nombre,apellidos,empresa,email,telefono,ciudad,nivel,compras_mes,comision_pct,activo,creado_en,referido_por')
        .order('creado_en', { ascending: false });
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const { usuario, password, rol, nombre, apellidos, empresa, email, telefono, ciudad, comision_pct, referido_por } = req.body;
      if (!usuario || !password || !rol) return res.status(400).json({ error: 'Faltan campos requeridos' });
      const { data, error } = await supabase.from('usuarios')
        .insert([{ usuario, password, rol, nombre, apellidos, empresa, email, telefono, ciudad, comision_pct: comision_pct || 0, referido_por: referido_por || null }])
        .select('id,usuario,rol,nombre').single();
      if (error) throw error;
      return res.status(200).json({ ok: true, user: data });
    }

    if (req.method === 'PUT') {
      const { id, ...updates } = req.body;
      if (!id) return res.status(400).json({ error: 'ID requerido' });
      if (updates.password === '') delete updates.password;
      const { error } = await supabase.from('usuarios').update(updates).eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
