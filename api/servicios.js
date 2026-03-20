const { supabase, cors } = require('./_supabase');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const { usuario_id } = req.query;
      let query = supabase.from('servicios').select('*, productos(nombre,presentacion)').order('fecha', { ascending: false });
      if (usuario_id) query = query.eq('usuario_id', usuario_id);
      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const { usuario_id, fecha, cliente, m2, producto_id, presentacion, cantidad, notas } = req.body;
      if (!usuario_id || !fecha || !cliente || !producto_id) return res.status(400).json({ error: 'Faltan campos requeridos' });

      const { data, error } = await supabase.from('servicios')
        .insert([{ usuario_id, fecha, cliente, m2, producto_id, presentacion, cantidad, notas }])
        .select().single();
      if (error) throw error;

      // Actualizar compras del mes
      const { data: prod } = await supabase.from('productos').select('precio_lista').eq('id', producto_id).single();
      if (prod) {
        const compraAdicional = prod.precio_lista * (cantidad || 1) * 0.75;
        const { data: usr } = await supabase.from('usuarios').select('compras_mes').eq('id', usuario_id).single();
        const nuevasCompras = (usr?.compras_mes || 0) + compraAdicional;
        const nuevoNivel = getNivel(nuevasCompras);
        await supabase.from('usuarios').update({ compras_mes: nuevasCompras, nivel: nuevoNivel }).eq('id', usuario_id);
      }

      return res.status(200).json({ ok: true, servicio: data });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

function getNivel(compras) {
  if (compras >= 30000) return 'socio';
  if (compras >= 15000) return 'master';
  if (compras >= 5000) return 'verde';
  return 'semilla';
}
