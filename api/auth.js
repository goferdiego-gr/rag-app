// ============================================================================
// API DE AUTENTICACION - Guardar como: /api/auth.js
// ============================================================================
// Este archivo maneja:
// - POST /api/auth?action=invite → Invitar usuario (superadmin/admin)
// - POST /api/auth?action=set-password → Establecer contraseña inicial
// - POST /api/auth?action=forgot-password → Solicitar reset
// - POST /api/auth?action=reset-password → Confirmar nuevo password
 
const { createClient } = require('@supabase/supabase-js');
 
const supabase = createClient(
  process.env.SUPABASE_URL || 'https://ybuwfzbxtjsvkcpymcbo.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' // ⚠️ Usa SERVICE KEY en Vercel (variables de entorno)
);
 
const cors = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};
 
// ─── UTILIDADES ───────────────────────────────────────────────────────────
 
async function getAdminUser(authToken) {
  if (!authToken) return null;
  const token = authToken.replace('Bearer ', '');
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  
  // Verificar que sea admin o superadmin
  const { data: usr } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('auth_id', data.user.id)
    .single();
  
  return usr?.rol === 'admin' || usr?.rol === 'superadmin' ? data.user : null;
}
 
// ─── ACCIÓN: INVITAR USUARIO ──────────────────────────────────────────────
 
async function inviteUser(req, res) {
  const { email, nombre, apellidos, rol, empresa } = req.body;
  const authHeader = req.headers.authorization;
 
  // Validar
  if (!email || !rol) {
    return res.status(400).json({ error: 'Email y rol son requeridos' });
  }
  if (!['vendedor', 'aplicador', 'distribuidor', 'admin'].includes(rol)) {
    return res.status(400).json({ error: 'Rol no válido' });
  }
 
  // Solo admin/superadmin pueden invitar
  const adminUser = await getAdminUser(authHeader);
  if (!adminUser) {
    return res.status(403).json({ error: 'No tienes permisos para invitar usuarios' });
  }
 
  try {
    // Verificar que el email no exista ya en auth
    const { data: existing } = await supabase.auth.admin.listUsers();
    if (existing?.users?.some(u => u.email === email)) {
      return res.status(400).json({ error: 'El email ya está registrado' });
    }
 
    // Crear invitación
    const token = require('crypto').randomBytes(32).toString('hex');
    const expiradoEn = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 días
 
    const { data: invitation, error: invError } = await supabase
      .from('invitations')
      .insert([{
        email,
        token,
        rol,
        nombre: nombre || '',
        apellidos: apellidos || '',
        empresa: empresa || '',
        invitado_por: adminUser.id,
        expirado_en: expiradoEn.toISOString()
      }])
      .select()
      .single();
 
    if (invError) throw invError;
 
    // Generar link de invitación
    const baseUrl = process.env.BASE_URL || 'https://tu-app.vercel.app';
    const setPasswordLink = `${baseUrl}/set-password?token=${token}`;
 
    // TODO: Aquí puedes enviar un email con el link usando SendGrid, Resend, etc.
    // Por ahora, solo devolvemos el link para testing
    console.log(`📧 Invitación enviada a ${email}: ${setPasswordLink}`);
 
    return res.status(200).json({
      ok: true,
      message: 'Usuario invitado correctamente',
      invitation_id: invitation.id,
      token, // En producción, NO devuelvas esto al frontend
      set_password_link: setPasswordLink // Temporal para testing
    });
  } catch (error) {
    console.error('Error en inviteUser:', error);
    return res.status(500).json({ error: error.message });
  }
}
 
// ─── ACCIÓN: VALIDAR TOKEN DE INVITACIÓN ──────────────────────────────────
 
async function validateInvitationToken(req, res) {
  const { token } = req.query;
 
  if (!token) {
    return res.status(400).json({ error: 'Token requerido' });
  }
 
  try {
    const { data: invitation, error } = await supabase
      .from('invitations')
      .select('*')
      .eq('token', token)
      .single();
 
    if (error || !invitation) {
      return res.status(404).json({ error: 'Invitación no encontrada' });
    }
 
    if (invitation.usado) {
      return res.status(400).json({ error: 'Esta invitación ya fue usada' });
    }
 
    if (new Date(invitation.expirado_en) < new Date()) {
      return res.status(400).json({ error: 'La invitación ha expirado' });
    }
 
    return res.status(200).json({
      ok: true,
      invitation: {
        email: invitation.email,
        nombre: invitation.nombre,
        rol: invitation.rol,
        empresa: invitation.empresa
      }
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
 
// ─── ACCIÓN: ESTABLECER CONTRASEÑA (PRIMER LOGIN) ──────────────────────────
 
async function setPassword(req, res) {
  const { token, password, password_confirm } = req.body;
 
  // Validar
  if (!token || !password) {
    return res.status(400).json({ error: 'Token y contraseña son requeridos' });
  }
 
  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener mínimo 6 caracteres' });
  }
 
  if (password !== password_confirm) {
    return res.status(400).json({ error: 'Las contraseñas no coinciden' });
  }
 
  try {
    // Obtener invitación
    const { data: invitation, error: invError } = await supabase
      .from('invitations')
      .select('*')
      .eq('token', token)
      .single();
 
    if (invError || !invitation) {
      return res.status(404).json({ error: 'Invitación no encontrada' });
    }
 
    if (invitation.usado) {
      return res.status(400).json({ error: 'Esta invitación ya fue usada' });
    }
 
    if (new Date(invitation.expirado_en) < new Date()) {
      return res.status(400).json({ error: 'La invitación ha expirado' });
    }
 
    // Crear usuario en Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: invitation.email,
      password: password,
      email_confirm: true,
      user_metadata: {
        nombre: invitation.nombre,
        apellidos: invitation.apellidos || '',
        empresa: invitation.empresa || ''
      }
    });
 
    if (authError) {
      // Si el usuario ya existe, intentar actualizar contraseña
      if (authError.message.includes('already exists')) {
        return res.status(400).json({ error: 'Este email ya tiene una cuenta' });
      }
      throw authError;
    }
 
    // Marcar invitación como usada
    await supabase
      .from('invitations')
      .update({ usado: true, usado_en: new Date().toISOString() })
      .eq('id', invitation.id);
 
    // El trigger automáticamente crea el usuario en tabla `usuarios`
 
    // Generar token de login
    const { data: sessionData, error: sessionError } = await supabase.auth.admin.createSession(authData.user.id);
    if (sessionError) throw sessionError;
 
    return res.status(200).json({
      ok: true,
      message: 'Contraseña establecida correctamente',
      user_id: authData.user.id,
      email: authData.user.email,
      session: sessionData.session
    });
  } catch (error) {
    console.error('Error en setPassword:', error);
    return res.status(500).json({ error: error.message });
  }
}
 
// ─── ACCIÓN: SOLICITAR RESET DE CONTRASEÑA ────────────────────────────────
 
async function forgotPassword(req, res) {
  const { email } = req.body;
 
  if (!email) {
    return res.status(400).json({ error: 'Email requerido' });
  }
 
  try {
    // Buscar usuario en auth
    const { data: users, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) throw listError;
 
    const authUser = users?.users?.find(u => u.email === email);
    if (!authUser) {
      // Por seguridad, no revelamos si el email existe
      return res.status(200).json({
        ok: true,
        message: 'Si el email existe, recibirás un link para reset'
      });
    }
 
    // Crear token de reset
    const resetToken = require('crypto').randomBytes(32).toString('hex');
    const expiradoEn = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hora
 
    const { data: reset, error: resetError } = await supabase
      .from('password_resets')
      .insert([{
        user_id: authUser.id,
        token: resetToken,
        expirado_en: expiradoEn.toISOString()
      }])
      .select()
      .single();
 
    if (resetError) throw resetError;
 
    // Generar link
    const baseUrl = process.env.BASE_URL || 'https://tu-app.vercel.app';
    const resetLink = `${baseUrl}/reset-password?token=${resetToken}`;
 
    // TODO: Enviar email con el link
    console.log(`📧 Reset de contraseña para ${email}: ${resetLink}`);
 
    return res.status(200).json({
      ok: true,
      message: 'Si el email existe, recibirás un link para reset',
      // En testing, devolvemos el link (NO en producción)
      reset_link: resetLink
    });
  } catch (error) {
    console.error('Error en forgotPassword:', error);
    return res.status(500).json({ error: error.message });
  }
}
 
// ─── ACCIÓN: CONFIRMAR RESET DE CONTRASEÑA ────────────────────────────────
 
async function resetPassword(req, res) {
  const { token, password, password_confirm } = req.body;
 
  if (!token || !password) {
    return res.status(400).json({ error: 'Token y contraseña son requeridos' });
  }
 
  if (password !== password_confirm) {
    return res.status(400).json({ error: 'Las contraseñas no coinciden' });
  }
 
  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener mínimo 6 caracteres' });
  }
 
  try {
    // Buscar reset token
    const { data: reset, error: resetError } = await supabase
      .from('password_resets')
      .select('*')
      .eq('token', token)
      .single();
 
    if (resetError || !reset) {
      return res.status(404).json({ error: 'Link de reset no encontrado' });
    }
 
    if (reset.usado) {
      return res.status(400).json({ error: 'Este link ya fue usado' });
    }
 
    if (new Date(reset.expirado_en) < new Date()) {
      return res.status(400).json({ error: 'El link ha expirado' });
    }
 
    // Actualizar contraseña en Auth
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      reset.user_id,
      { password: password }
    );
 
    if (updateError) throw updateError;
 
    // Marcar reset como usado
    await supabase
      .from('password_resets')
      .update({ usado: true, usado_en: new Date().toISOString() })
      .eq('id', reset.id);
 
    return res.status(200).json({
      ok: true,
      message: 'Contraseña actualizada correctamente'
    });
  } catch (error) {
    console.error('Error en resetPassword:', error);
    return res.status(500).json({ error: error.message });
  }
}
 
// ─── ROUTER PRINCIPAL ──────────────────────────────────────────────────────
 
module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
 
  try {
    const { action } = req.query;
 
    switch (action) {
      case 'invite':
        return await inviteUser(req, res);
      case 'validate-token':
        return await validateInvitationToken(req, res);
      case 'set-password':
        return await setPassword(req, res);
      case 'forgot-password':
        return await forgotPassword(req, res);
      case 'reset-password':
        return await resetPassword(req, res);
      default:
        return res.status(400).json({ error: 'Acción no válida' });
    }
  } catch (error) {
    console.error('Error en /api/auth:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};
 
