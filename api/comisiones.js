const { supabase, cors } = require('./_supabase');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    if (req.method === 'GET') {
      const { vendedor_id, all } = req.query;
      let query = supabase.from('comision_pagos')
        .select('*, vendedor:usuarios!vendedor_id(nombre,apellidos), pedidos(total,cliente_id,clientes(empresa,contacto))')
        .order('creado_en', { ascending: false });
      if (!all) query = query.eq('vendedor_id', vendedor_id);
      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json(data);
    }
    if (req.method === 'PUT') {
      const { id, status } = req.body;
      const { error } = await supabase.from('comision_pagos').update({ status }).eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
