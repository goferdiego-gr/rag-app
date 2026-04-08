const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://ybuwfzbxtjsvkcpymcbo.supabase.co',
  process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlidXdmemJ4dGpzdmtjcHltY2JvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMzkxNzQsImV4cCI6MjA4OTYxNTE3NH0.XL9czwelRyqiu-fiBDdAfq0ox_IMF1FsUDZTCpMYguE'
);

const cors = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    const { usuario, password, email } = req.body;
    const loginId = email || usuario;
    if (!loginId || !password) return res.status(400).json({ error: 'Credenciales requeridas' });

    // 1. Try Supabase Auth (new users with email)
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: loginId, password
    });
    if (!authError && authData?.user) {
      const { data: userData } = await supabase.from('usuarios')
        .select('*').eq('auth_id', authData.user.id).single();
      if (userData) {
        const { password: _, ...user } = userData;
        return res.status(200).json({ ok: true, user, session: authData.session });
      }
    }

    // 2. Legacy login (existing users)
    const { data: oldUser, error: oldError } = await supabase.from('usuarios')
      .select('*').eq('usuario', loginId).eq('password', password).eq('activo', true).single();
    if (!oldError && oldUser) {
      const { password: _, ...user } = oldUser;
      return res.status(200).json({ ok: true, user });
    }

    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
