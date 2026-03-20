const { supabase, cors } = require('./_supabase');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('usuarios')
        .select('id,usuario,rol,nombre,apellidos,empresa,email,telefono,ciudad,nivel,compras_mes,activo,creado_en,referido_por')
        .order('creado_en', { ascending: false });
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const { usuario, password, rol, nombre, apellidos, empresa, email, telefono, ciudad, referido_por } = req.body;
      if (!usuario || !password || !rol) return res.status(400).json({ error: 'Faltan campos requeridos' });

      const { data, error } = await supabase
        .from('usuarios')
        .insert([{ usuario, password, rol, nombre, apellidos, empresa, email, telefono, ciudad, referido_por: referido_por || null }])
        .select('id,usuario,rol,nombre')
        .single();
      if (error) throw error;

      // Si fue referido, pagar bono
      if (referido_por) {
        const { data: cfg } = await supabase.from('configuracion').select('valor').eq('clave', 'referidos').single();
        const bono = cfg ? JSON.parse(cfg.valor).bono_unico : 500;
        await supabase.from('usuarios').update({ bono_referidos: supabase.rpc('increment', { x: bono }) }).eq('id', referido_por);
      }

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
