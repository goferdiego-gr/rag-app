const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://ybuwfzbxtjsvkcpymcbo.supabase.co',
  process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
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
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña requeridos' });
    }

    // Login con Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error || !data.user) {
      return res.status(401).json({ error: 'Email o contraseña incorrectos' });
    }

    // Obtener datos del usuario desde tabla usuarios
    const { data: userData, error: userError } = await supabase
      .from('usuarios')
      .select('*')
      .eq('auth_id', data.user.id)
      .single();

    if (userError || !userData) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }

    // Devolver usuario (sin contraseña)
    const { password: _, ...user } = userData;
    return res.status(200).json({ ok: true, user, session: data.session });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
