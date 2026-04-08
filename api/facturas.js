const { supabase, cors } = require('./_supabase');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    if (req.method === 'GET') {
      const { pedido_id, all } = req.query;
      let query = supabase.from('facturas')
        .select('*, pedidos(total, cliente_id, clientes(empresa,contacto,rfc)), usuarios(nombre,apellidos)')
        .order('creado_en', { ascending: false });
      if (pedido_id) query = query.eq('pedido_id', pedido_id);
      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json(data);
    }
    if (req.method === 'POST') {
      const { pedido_id, usuario_id, razon_social, rfc, direccion_fiscal, email_factura, notas } = req.body;
      if (!pedido_id || !rfc) return res.status(400).json({ error: 'Faltan campos requeridos' });
      const { data, error } = await supabase.from('facturas')
        .insert([{ pedido_id, usuario_id, razon_social, rfc, direccion_fiscal, email_factura, notas }])
        .select().single();
      if (error) throw error;
      return res.status(200).json({ ok: true, factura: data });
    }
    if (req.method === 'PUT') {
      const { id, status } = req.body;
      const { error } = await supabase.from('facturas').update({ status }).eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
