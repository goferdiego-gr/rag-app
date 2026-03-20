const { supabase, cors } = require('./_supabase');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const { usuario_id, all } = req.query;
      let query = supabase
        .from('pedidos')
        .select('*, usuarios(nombre,apellidos,empresa), cedis(nombre,ciudad), pedido_items(*, productos(nombre,presentacion))')
        .order('creado_en', { ascending: false });
      if (usuario_id && !all) query = query.eq('usuario_id', usuario_id);
      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const { usuario_id, cedis_id, items, notas } = req.body;
      if (!usuario_id || !cedis_id || !items?.length) return res.status(400).json({ error: 'Faltan campos requeridos' });

      const total = items.reduce((a, i) => a + i.subtotal, 0);
      const { data: pedido, error } = await supabase
        .from('pedidos').insert([{ usuario_id, cedis_id, total, notas }]).select().single();
      if (error) throw error;

      const itemsConPedido = items.map(i => ({ ...i, pedido_id: pedido.id }));
      await supabase.from('pedido_items').insert(itemsConPedido);

      return res.status(200).json({ ok: true, pedido });
    }

    if (req.method === 'PUT') {
      const { id, status } = req.body;
      if (!id || !status) return res.status(400).json({ error: 'Faltan campos' });
      const { error } = await supabase.from('pedidos').update({ status, actualizado_en: new Date() }).eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
