const { supabase, cors } = require('./_supabase');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    // ── GET ──────────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const { vendedor_id, all } = req.query;
      let query = supabase.from('cotizaciones')
        .select('*, vendedor:usuarios!vendedor_id(nombre,apellidos), clientes(contacto,empresa,ciudad)')
        .order('creado_en', { ascending: false });
      if (!all) query = query.eq('vendedor_id', vendedor_id);
      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json(data);
    }

    // ── POST ─────────────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const { vendedor_id, cliente_id, notas, productos_solicitados } = req.body;
      if (!vendedor_id || !cliente_id) return res.status(400).json({ error: 'Faltan campos' });
      const { data, error } = await supabase.from('cotizaciones')
        .insert([{ vendedor_id, cliente_id, notas, productos_solicitados: productos_solicitados||null, status: 'pendiente' }])
        .select().single();
      if (error) throw error;
      return res.status(200).json({ ok: true, cotizacion: data });
    }

    // ── PUT ──────────────────────────────────────────────────────────────────
    if (req.method === 'PUT') {
      const { id, status, archivo_url } = req.body;
      if (!id) return res.status(400).json({ error: 'ID requerido' });
      const updates = { actualizado_en: new Date() };
      if (status) updates.status = status;
      if (archivo_url) { updates.archivo_url = archivo_url; updates.status = 'completado'; }
      const { error } = await supabase.from('cotizaciones').update(updates).eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    // ── DELETE ───────────────────────────────────────────────────────────────
    // Solo el vendedor propietario puede eliminar cotizaciones en estado 'pendiente'
    if (req.method === 'DELETE') {
      const { id, vendedor_id } = req.query;
      if (!id || !vendedor_id) {
        return res.status(400).json({ error: 'ID de cotización y vendedor requeridos' });
      }

      try {
        // Obtener cotización
        const { data: cotizacion, error: readErr } = await supabase.from('cotizaciones')
          .select('id, status, vendedor_id')
          .eq('id', id)
          .single();

        if (readErr || !cotizacion) {
          return res.status(404).json({ error: 'Cotización no encontrada' });
        }

        // Verificar que sea propietario (vendedor_id coincida)
        if (cotizacion.vendedor_id !== vendedor_id) {
          return res.status(403).json({ error: 'No tienes permiso para eliminar esta cotización' });
        }

        // Solo permitir eliminar si está en estado 'pendiente'
        if (cotizacion.status !== 'pendiente') {
          return res.status(400).json({ 
            error: `No se puede eliminar una cotización en estado '${cotizacion.status}'. Solo se pueden eliminar cotizaciones pendientes.` 
          });
        }

        // Eliminar la cotización
        const { error: delErr } = await supabase.from('cotizaciones')
          .delete()
          .eq('id', id);

        if (delErr) throw delErr;

        return res.status(200).json({ 
          ok: true, 
          message: 'Cotización eliminada correctamente' 
        });
      } catch (error) {
        console.error('Error eliminando cotización:', error);
        return res.status(500).json({ error: error.message });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
