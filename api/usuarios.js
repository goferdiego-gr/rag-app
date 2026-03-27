const { supabase, cors } = require('./_supabase');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    if (req.method === 'GET') {
      const { id } = req.query;
      if (id) {
        const { data, error } = await supabase.from('usuarios')
          .select('id,usuario,rol,nombre,apellidos,empresa,email,telefono,ciudad,nivel,compras_mes,ventas_pagadas,comision_pct,activo,creado_en,integrado_por,litros_mes,auth_id')
          .eq('id', id).single();
        if (error) throw error;
        return res.status(200).json(data);
      }
      const { data, error } = await supabase.from('usuarios')
        .select('id,usuario,rol,nombre,apellidos,empresa,email,telefono,ciudad,nivel,compras_mes,ventas_pagadas,comision_pct,activo,creado_en,integrado_por,litros_mes,auth_id')
        .order('creado_en', { ascending: false });
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const { rol_solicitante, usuario, password, rol, nombre, apellidos, empresa, email, telefono, ciudad, comision_pct, integrado_por } = req.body;
      if (rol_solicitante === 'admin') return res.status(403).json({ error: 'Solo el superadmin puede crear usuarios' });
      if (!usuario || !password || !rol) return res.status(400).json({ error: 'Faltan campos requeridos' });

      let auth_id = null;

      // If email provided, create Supabase Auth user
      if (email) {
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { nombre, apellidos, rol }
        });
        if (!authError && authData?.user) {
          auth_id = authData.user.id;
        }
      }

      const { data, error } = await supabase.from('usuarios')
        .insert([{ usuario, password, rol, nombre, apellidos, empresa, email: email||null, telefono, ciudad, comision_pct: comision_pct||0, integrado_por: integrado_por||null, auth_id }])
        .select('id,usuario,rol,nombre').single();
      if (error) throw error;
      return res.status(200).json({ ok: true, user: data });
    }

    if (req.method === 'PUT') {
      const { id, rol_solicitante, ...updates } = req.body;
      if (!id) return res.status(400).json({ error: 'ID requerido' });
      if (rol_solicitante === 'admin' && updates.rol !== undefined) return res.status(403).json({ error: 'Sin permiso' });
      if (updates.password === '') delete updates.password;
      delete updates.rol_solicitante;

      // If password changed and user has auth_id, update in Supabase Auth too
      if (updates.password && updates.auth_id) {
        await supabase.auth.admin.updateUserById(updates.auth_id, { password: updates.password });
      }

      const { error } = await supabase.from('usuarios').update(updates).eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
