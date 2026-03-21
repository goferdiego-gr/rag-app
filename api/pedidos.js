const { supabase, cors } = require('./_supabase');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    if (req.method === 'GET') {
      const { usuario_id, all } = req.query;
      let query = supabase.from('pedidos')
        .select('*, usuarios(nombre,apellidos,empresa,rol), cedis(nombre,ciudad), pedido_items(*, productos(nombre,presentacion))')
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
      const { data: pedido, error } = await supabase.from('pedidos')
        .insert([{ usuario_id, cedis_id, total, notas }]).select().single();
      if (error) throw error;
      const itemsConPedido = items.map(i => ({ ...i, pedido_id: pedido.id }));
      await supabase.from('pedido_items').insert(itemsConPedido);
      return res.status(200).json({ ok: true, pedido });
    }

    if (req.method === 'PUT') {
      const { id, status } = req.body;
      if (!id || !status) return res.status(400).json({ error: 'Faltan campos' });

      // Update pedido status
      const { error } = await supabase.from('pedidos').update({ status, actualizado_en: new Date() }).eq('id', id);
      if (error) throw error;

      // Si es enviado o entregado, descontar stock
      if (status === 'enviado' || status === 'entregado') {
        const { data: pedido } = await supabase.from('pedidos')
          .select('cedis_id, pedido_items(producto_id, cantidad)').eq('id', id).single();
        if (pedido?.pedido_items) {
          for (const item of pedido.pedido_items) {
            const { data: stockRow } = await supabase.from('stock')
              .select('cantidad').eq('cedis_id', pedido.cedis_id).eq('producto_id', item.producto_id).single();
            if (stockRow) {
              const nuevaCant = Math.max(0, (stockRow.cantidad || 0) - item.cantidad);
              await supabase.from('stock').update({ cantidad: nuevaCant, actualizado_en: new Date() })
                .eq('cedis_id', pedido.cedis_id).eq('producto_id', item.producto_id);
            }
          }
        }
      }

      // Si es pagado, actualizar compras del usuario y comision vendedor si aplica
      if (status === 'pagado') {
        const { data: pedido } = await supabase.from('pedidos')
          .select('usuario_id, total, usuarios(rol, compras_mes, comision_pct)').eq('id', id).single();
        if (pedido) {
          const nuevasCompras = (pedido.usuarios?.compras_mes || 0) + pedido.total;
          const nuevoNivel = getNivel(nuevasCompras);
          await supabase.from('usuarios').update({ compras_mes: nuevasCompras, nivel: nuevoNivel }).eq('id', pedido.usuario_id);
        }
      }

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

function getNivel(c) { return c >= 30000 ? 'socio' : c >= 15000 ? 'master' : c >= 5000 ? 'verde' : 'semilla'; }
