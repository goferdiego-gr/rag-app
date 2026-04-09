const { supabase, cors } = require('./_supabase');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
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
    if (req.method === 'POST') {
      const { vendedor_id, cliente_id, notas, productos_solicitados } = req.body;
      if (!vendedor_id || !cliente_id) return res.status(400).json({ error: 'Faltan campos' });
      const { data, error } = await supabase.from('cotizaciones')
        .insert([{ vendedor_id, cliente_id, notas, productos_solicitados: productos_solicitados||null, status: 'pendiente' }])
        .select().single();
      if (error) throw error;
      return res.status(200).json({ ok: true, cotizacion: data });
    }
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
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'ID requerido' });
      const { data: c } = await supabase.from('cotizaciones').select('status').eq('id',id).single();
      if (c?.status === 'completado') return res.status(400).json({ error: 'No se puede eliminar una cotizacion completada' });
      await supabase.from('cotizaciones').delete().eq('id', id);
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
