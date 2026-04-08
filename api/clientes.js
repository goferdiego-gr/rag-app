const { supabase, cors } = require('./_supabase');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    if (req.method === 'GET') {
      const { vendedor_id } = req.query;
      let query = supabase.from('clientes').select('*').order('creado_en', { ascending: false });
      if (vendedor_id) query = query.eq('vendedor_id', vendedor_id);
      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const { vendedor_id, empresa, contacto, telefono, email, estado, ciudad, direccion, rfc, notas, comision_pct } = req.body;
      if (!vendedor_id || !contacto) return res.status(400).json({ error: 'Faltan campos requeridos' });
      const { data, error } = await supabase.from('clientes')
        .insert([{ vendedor_id, empresa, contacto, telefono, email, estado, ciudad, direccion, rfc, notas, comision_pct: comision_pct || 0 }])
        .select().single();
      if (error) throw error;
      return res.status(200).json({ ok: true, cliente: data });
    }

    if (req.method === 'PUT') {
      const { id, ...updates } = req.body;
      if (!id) return res.status(400).json({ error: 'ID requerido' });
      updates.actualizado_en = new Date();

      // Si status cambia a 'pagado', calcular comision
      if (updates.status === 'pagado' && updates.monto_vendido) {
        const { data: cliente } = await supabase.from('clientes').select('comision_pct').eq('id', id).single();
        const pct = updates.comision_pct || cliente?.comision_pct || 0;
        updates.comision_ganada = (updates.monto_vendido * pct) / 100;
      }

      const { error } = await supabase.from('clientes').update(updates).eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'ID requerido' });
      const { error } = await supabase.from('clientes').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
