// ============================================================================
// ARCHIVO: /api/login.js (CORREGIDO PARA AUTH)
// ============================================================================
// Reemplaza TODO el contenido de tu /api/login.js con esto

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
    // Puede venir como usuario/password O email/password
    const { usuario, password, email } = req.body;
    const loginEmail = email || usuario; // Si viene usuario, usarlo como email

    if (!loginEmail || !password) {
      return res.status(400).json({ error: 'Email y contraseña requeridos' });
    }

    // PRIMERO: Intentar login con Supabase Auth (NEW)
    console.log(`🔐 Intentando auth con: ${loginEmail}`);
    
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: password
    });

    if (!authError && authData.user) {
      console.log(`✅ Auth exitoso para: ${loginEmail}`);
      
      // Obtener datos del usuario desde tabla usuarios
      const { data: userData, error: userError } = await supabase
        .from('usuarios')
        .select('*')
        .eq('auth_id', authData.user.id)
        .single();

      if (userError || !userData) {
        console.warn(`⚠️ Usuario en Auth pero no en tabla usuarios: ${loginEmail}`);
        // Usuario en Auth pero no sincronizado. Crear manualmente:
        const { data: newUser, error: createError } = await supabase
          .from('usuarios')
          .insert([{
            id: require('crypto').randomUUID(),
            email: authData.user.email,
            auth_id: authData.user.id,
            usuario: authData.user.email,
            nombre: authData.user.raw_user_meta_data?.nombre || 'Usuario',
            password: 'auth_' + authData.user.id,
            rol: authData.user.raw_user_meta_data?.rol || 'aplicador',
            activo: true
          }])
          .select()
          .single();
        
        if (!createError && newUser) {
          const { password: _, ...user } = newUser;
          return res.status(200).json({ ok: true, user, session: authData.session });
        }
      }

      // Usuario existe en tabla usuarios
      const { password: _, ...user } = userData;
      return res.status(200).json({ ok: true, user, session: authData.session });
    }

    // SEGUNDO: Si Auth falla, intentar tabla antigua (FALLBACK para migración)
    console.log(`⚠️ Auth falló, intentando tabla antigua...`);
    
    const { data: oldUser, error: oldError } = await supabase
      .from('usuarios')
      .select('*')
      .eq('usuario', loginEmail)
      .eq('password', password)
      .eq('activo', true)
      .single();

    if (!oldError && oldUser) {
      console.log(`✅ Login exitoso en tabla antigua: ${loginEmail}`);
      const { password: _, ...user } = oldUser;
      return res.status(200).json({ ok: true, user });
    }

    // Ambos fallaron
    console.log(`❌ Login fallido para: ${loginEmail}`);
    return res.status(401).json({ error: 'Email o contraseña incorrectos' });

  } catch (error) {
    console.error('❌ Error en login:', error);
    return res.status(500).json({ error: error.message });
  }
};
