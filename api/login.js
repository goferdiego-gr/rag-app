const { supabase, cors } = require('./_supabase');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { usuario, password } = req.body;

    // Try Supabase Auth first (new users with email)
    const isEmail = usuario.includes('@');
    if (isEmail) {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: usuario,
        password: password
      });
      if (!authError && authData?.user) {
        // Find matching usuario record
        const { data: userData } = await supabase.from('usuarios')
          .select('id,usuario,rol,nombre,apellidos,empresa,email,telefono,ciudad,nivel,compras_mes,ventas_pagadas,comision_pct,litros_mes,activo,integrado_por,auth_id')
          .eq('auth_id', authData.user.id)
          .single();
        if (userData) {
          const { password: _, ...user } = userData;
          return res.status(200).json({ ok: true, user, session: authData.session });
        }
      }
    }

    // Fallback: legacy login (existing users without auth_id)
    const { data, error } = await supabase.from('usuarios')
      .select('*')
      .eq('usuario', usuario)
      .eq('password', password)
      .eq('activo', true)
      .single();
    if (error || !data) return res.status(401).json({ error: 'Usuario o contrasena incorrectos' });
    const { password: _, ...user } = data;
    return res.status(200).json({ ok: true, user });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
