const { supabase, cors } = require('./_supabase');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    if (req.method === 'GET') {
      const { usuario_id, vendedor_id, cliente_id, all } = req.query;
      let query = supabase.from('pedidos')
        .select('*, usuario:usuarios!usuario_id(nombre,apellidos,empresa,rol), vendedor:usuarios!vendedor_id(nombre,apellidos), cedis(nombre,ciudad), clientes(contacto,empresa,ciudad), pedido_items(*, productos(nombre,presentacion,precio_lista))')
        .order('creado_en', { ascending: false });
      if (!all) {
        if (vendedor_id) query = query.eq('vendedor_id', vendedor_id);
        else if (usuario_id) query = query.eq('usuario_id', usuario_id);
      }
      if (cliente_id) query = query.eq('cliente_id', cliente_id);
      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const { usuario_id, vendedor_id, cliente_id, cedis_id, items, notas, direccion_entrega } = req.body;
      if (!usuario_id || !cedis_id || !items?.length) return res.status(400).json({ error: 'Faltan campos requeridos' });
      const total = items.reduce((a, i) => a + i.subtotal, 0);
      const { data: pedido, error } = await supabase.from('pedidos')
        .insert([{ usuario_id, vendedor_id: vendedor_id || null, cliente_id: cliente_id || null, cedis_id, total, notas, direccion_entrega: direccion_entrega || null }])
        .select().single();
      if (error) throw error;
      await supabase.from('pedido_items').insert(items.map(i => ({ ...i, pedido_id: pedido.id })));
      return res.status(200).json({ ok: true, pedido });
    }

    if (req.method === 'PUT') {
      const { id, status } = req.body;
      if (!id || !status) return res.status(400).json({ error: 'Faltan campos' });
      const { error } = await supabase.from('pedidos').update({ status, actualizado_en: new Date() }).eq('id', id);
      if (error) throw error;

      if (status === 'enviado' || status === 'entregado') {
        const { data: p } = await supabase.from('pedidos').select('cedis_id, pedido_items(producto_id, cantidad)').eq('id', id).single();
        if (p?.pedido_items) {
          for (const item of p.pedido_items) {
            const { data: s } = await supabase.from('stock').select('cantidad').eq('cedis_id', p.cedis_id).eq('producto_id', item.producto_id).single();
            if (s) await supabase.from('stock').update({ cantidad: Math.max(0, (s.cantidad || 0) - item.cantidad), actualizado_en: new Date() }).eq('cedis_id', p.cedis_id).eq('producto_id', item.producto_id);
          }
        }
      }

      if (status === 'pagado') {
        const { data: p } = await supabase.from('pedidos').select('vendedor_id, usuario_id, cliente_id, total').eq('id', id).single();
        const vendId = p?.vendedor_id || p?.usuario_id;
        if (vendId) {
          const { data: usr } = await supabase.from('usuarios').select('ventas_pagadas, compras_mes, comision_pct, rol, nivel').eq('id', vendId).single();
          if (usr?.rol === 'vendedor') {
            const nuevasVentas = (usr.ventas_pagadas || 0) + (p.total || 0);
            const comisionGanada = (p.total || 0) * (usr.comision_pct || 0) / 100;
            await supabase.from('usuarios').update({ ventas_pagadas: nuevasVentas }).eq('id', vendId);
            if (p.cliente_id) {
              const { data: cli } = await supabase.from('clientes').select('comision_ganada, monto_vendido').eq('id', p.cliente_id).single();
              await supabase.from('clientes').update({
                comision_ganada: (cli?.comision_ganada || 0) + comisionGanada,
                monto_vendido: (cli?.monto_vendido || 0) + (p.total || 0),
                status: 'pagado'
              }).eq('id', p.cliente_id);
            }
          } else if (usr?.rol === 'aplicador' || usr?.rol === 'distribuidor') {
            const nuevasCompras = (usr.compras_mes || 0) + (p.total || 0);
            await supabase.from('usuarios').update({ compras_mes: nuevasCompras, nivel: getNivel(nuevasCompras) }).eq('id', vendId);
          }
        }
      }

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('PEDIDOS ERROR:', e);
    return res.status(500).json({ error: e.message, stack: e.stack });
  }
```

Commit en GitHub y luego cambia el status de un pedido. Abre la URL directamente:
```
https://rag-app-delta.vercel.app/api/pedidos
};

function getNivel(c) { return c >= 30000 ? 'socio' : c >= 15000 ? 'master' : c >= 5000 ? 'verde' : 'semilla'; }
