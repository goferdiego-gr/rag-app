const { supabase, cors } = require('./_supabase');

const TRIGGERS_COMISION = ['pagado', 'enviado', 'entregado'];
const TRIGGERS_STOCK    = ['enviado', 'entregado'];

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {

    if (req.method === 'GET') {
      const { usuario_id, vendedor_id, cliente_id, all } = req.query;
      let q = supabase.from('pedidos')
        .select('*, usuario:usuarios!usuario_id(nombre,apellidos,empresa,rol), vendedor:usuarios!vendedor_id(nombre,apellidos), cedis(nombre,ciudad), clientes(contacto,empresa,ciudad,rfc,direccion), pedido_items(*, productos(nombre,presentacion,precio_lista,precio_sin_iva))')
        .order('creado_en', { ascending: false });
      if (all !== '1') {
        const uid = vendedor_id || usuario_id;
        if (uid) q = q.or(`vendedor_id.eq.${uid},usuario_id.eq.${uid}`);
      }
      if (cliente_id) q = q.eq('cliente_id', cliente_id);
      const { data, error } = await q;
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const { usuario_id, vendedor_id, cliente_id, cedis_id, items, notas, direccion_entrega, skip_stock } = req.body;
      if (!usuario_id || !cedis_id || !items?.length)
        return res.status(400).json({ error: 'Faltan campos requeridos' });

      const stockWarnings = [];
      for (const item of items) {
        const { data: s } = await supabase.from('stock').select('cantidad')
          .eq('cedis_id', cedis_id).eq('producto_id', item.producto_id).single();
        const disp = s?.cantidad || 0;
        const { data: pr } = await supabase.from('productos').select('nombre,presentacion').eq('id', item.producto_id).single();
        const nombre = `${pr?.nombre||''} ${pr?.presentacion||''}`.trim();
        if (disp === 0) {
          if (!skip_stock) return res.status(400).json({ error: `Sin stock: ${nombre}.`, sin_stock: true });
          stockWarnings.push(`SIN STOCK: ${nombre}`);
        } else if (disp < item.cantidad) {
          if (!skip_stock) return res.status(400).json({ error: `Stock insuficiente: ${nombre}. Disponible: ${disp}, solicitado: ${item.cantidad}.`, sin_stock: true });
          stockWarnings.push(`STOCK BAJO: ${nombre} (disponible: ${disp})`);
        }
      }

      const total = items.reduce((a, i) => a + i.subtotal, 0);
      const notasConAviso = stockWarnings.length
        ? `⚠️ AVISO STOCK: ${stockWarnings.join('; ')}${notas ? '. ' + notas : ''}`
        : notas;

      const { data: pedido, error } = await supabase.from('pedidos')
        .insert([{ usuario_id, vendedor_id: vendedor_id||null, cliente_id: cliente_id||null,
          cedis_id, total, notas: notasConAviso, status: 'pendiente',
          direccion_entrega: direccion_entrega||null }])
        .select().single();
      if (error) throw error;
      await supabase.from('pedido_items').insert(items.map(i => ({ ...i, pedido_id: pedido.id })));
      return res.status(200).json({ ok: true, pedido, stockWarnings });
    }

    if (req.method === 'PUT') {
      const { id, status, remision_url, fecha_entrega } = req.body;
      if (!id) return res.status(400).json({ error: 'ID requerido' });

      // Handle file URL updates and date without status change
      if (remision_url !== undefined || fecha_entrega !== undefined) {
        const updates = { actualizado_en: new Date() };
        if (remision_url !== undefined) updates.remision_url = remision_url;
        if (fecha_entrega !== undefined) updates.fecha_entrega = fecha_entrega;
        const { error } = await supabase.from('pedidos').update(updates).eq('id', id);
        if (error) throw error;
        return res.status(200).json({ ok: true });
      }

      if (!status) return res.status(400).json({ error: 'Faltan campos' });

      const { data: p, error: readErr } = await supabase.from('pedidos')
        .select('status, vendedor_id, usuario_id, cliente_id, total, cedis_id, pedido_items(cantidad, producto_id, productos(presentacion))')
        .eq('id', id).single();
      if (readErr) throw readErr;

      const prevStatus = p.status || 'pendiente';
      const { error: updErr } = await supabase.from('pedidos').update({ status, actualizado_en: new Date() }).eq('id', id);
      if (updErr) throw updErr;

      const needsComision = TRIGGERS_COMISION.includes(status) && !TRIGGERS_COMISION.includes(prevStatus);
      const needsStock    = TRIGGERS_STOCK.includes(status) && !TRIGGERS_STOCK.includes(prevStatus);

      if (needsStock && p.pedido_items?.length) {
        for (const item of p.pedido_items) {
          const { data: s } = await supabase.from('stock').select('cantidad')
            .eq('cedis_id', p.cedis_id).eq('producto_id', item.producto_id).single();
          if (s) await supabase.from('stock').update({
            cantidad: Math.max(0, (s.cantidad||0) - item.cantidad), actualizado_en: new Date()
          }).eq('cedis_id', p.cedis_id).eq('producto_id', item.producto_id);
        }
      }

      if (needsComision) {
        const vendId = p.vendedor_id || p.usuario_id;
        if (!vendId) return res.status(200).json({ ok: true });
        const { data: usr } = await supabase.from('usuarios')
          .select('ventas_pagadas, compras_mes, comision_pct, rol, nivel, litros_mes')
          .eq('id', vendId).single();
        if (!usr) return res.status(200).json({ ok: true });

        if (usr.rol === 'vendedor' || usr.rol === 'admin' || usr.rol === 'superadmin') {
          const litrosVendidos = (p.pedido_items||[]).reduce((acc, item) => {
            const pres = item.productos?.presentacion || '1L';
            const match = pres.match(/(\d+\.?\d*)\s*[Ll]/);
            return acc + (item.cantidad * (match ? parseFloat(match[1]) : 1));
          }, 0);

          const nuevosLitros = (usr.litros_mes||0) + litrosVendidos;
          const nuevasVentas = (usr.ventas_pagadas||0) + (p.total||0);

          // Load nivel config
          const { data: cfgRow } = await supabase.from('configuracion').select('valor').eq('clave','niveles_vendedor').single();
          const { data: cfgInm } = await supabase.from('configuracion').select('valor').eq('clave','comision_inmediata_pct').single();
          const nivelesVend = cfgRow
            ? JSON.parse(cfgRow.valor)
            : { semilla:{min_litros:0,pct:10}, verde:{min_litros:100,pct:15}, master:{min_litros:500,pct:18}, socio:{min_litros:1000,pct:20} };
          const pctInmediata = cfgInm ? parseFloat(cfgInm.valor) : 10;

          // Determine nivel by litros
          const sorted = Object.entries(nivelesVend).sort((a,b) => b[1].min_litros - a[1].min_litros);
          let nuevoNivel = 'semilla';
          for (const [k,n] of sorted) {
            if (nuevosLitros >= (n.min_litros||0)) { nuevoNivel = k; break; }
          }

          // Use individual pct if set, else nivel pct from config
          const pctVendedor = (usr.comision_pct > 0)
            ? usr.comision_pct
            : (nivelesVend[nuevoNivel]?.pct || 10);

          const totalSinIva   = (p.total||0) / 1.16;
          const comisionInm   = totalSinIva * pctInmediata / 100;
          const comisionTotal = totalSinIva * pctVendedor / 100;
          const comisionBono  = Math.max(0, comisionTotal - comisionInm);

          const hoy = new Date();
          const diasJueves = ((4 - hoy.getDay() + 7) % 7) || 7;
          const jueves = new Date(hoy);
          jueves.setDate(hoy.getDate() + diasJueves);

          await supabase.from('usuarios').update({
            ventas_pagadas: nuevasVentas,
            litros_mes: nuevosLitros,
            nivel: nuevoNivel,
            comision_pct: pctVendedor
          }).eq('id', vendId);

          await supabase.from('comision_pagos').insert([{
            vendedor_id: vendId, pedido_id: id,
            monto_venta: totalSinIva, pct_aplicado: pctInmediata,
            monto_comision: comisionInm, tipo: 'inmediata', status: 'pendiente',
            fecha_pago_esperada: jueves.toISOString().split('T')[0]
          }]);

          if (comisionBono > 0.01) {
            await supabase.from('comision_pagos').insert([{
              vendedor_id: vendId, pedido_id: id,
              monto_venta: totalSinIva, pct_aplicado: pctVendedor - pctInmediata,
              monto_comision: comisionBono, tipo: 'bono_mensual', status: 'pendiente',
              fecha_pago_esperada: null
            }]);
          }

          if (p.cliente_id) {
            const { data: cli } = await supabase.from('clientes')
              .select('comision_ganada,monto_vendido').eq('id', p.cliente_id).single();
            await supabase.from('clientes').update({
              comision_ganada: (cli?.comision_ganada||0) + comisionTotal,
              monto_vendido:   (cli?.monto_vendido||0)   + (p.total||0)
            }).eq('id', p.cliente_id);
          }

        } else {
          const nuevasCompras = (usr.compras_mes||0) + (p.total||0);
          await supabase.from('usuarios').update({
            compras_mes: nuevasCompras,
            nivel: getNivelCompras(nuevasCompras)
          }).eq('id', vendId);
        }
      }

      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'ID requerido' });
      const { data: p } = await supabase.from('pedidos').select('status').eq('id', id).single();
      if (!p) return res.status(404).json({ error: 'Pedido no encontrado' });
      if (!['pendiente','confirmado'].includes(p.status))
        return res.status(400).json({ error: 'Solo se pueden eliminar pedidos pendientes o confirmados' });
      await supabase.from('pedido_items').delete().eq('pedido_id', id);
      await supabase.from('pedidos').delete().eq('id', id);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('PEDIDOS ERROR:', e.message);
    return res.status(500).json({ error: e.message });
  }
};

function getNivelCompras(c) {
  return c >= 30000 ? 'socio' : c >= 15000 ? 'master' : c >= 5000 ? 'verde' : 'semilla';
}
