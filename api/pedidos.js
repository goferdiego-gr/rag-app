const { supabase, cors } = require('./_supabase');

// Actions triggered by each status
// pagado: comision + factura habilitada
// enviado: comision + factura + stock descuento
// entregado: comision + factura + stock descuento (all of above)
// cancelado, pendiente, confirmado: nothing

const TRIGGERS_COMISION = ['pagado', 'enviado', 'entregado'];
const TRIGGERS_STOCK = ['enviado', 'entregado'];

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    if (req.method === 'GET') {
      const { usuario_id, vendedor_id, cliente_id, all } = req.query;
      let query = supabase.from('pedidos')
        .select('*, usuario:usuarios!usuario_id(nombre,apellidos,empresa,rol), vendedor:usuarios!vendedor_id(nombre,apellidos), cedis(nombre,ciudad), clientes(contacto,empresa,ciudad,rfc,direccion), pedido_items(*, productos(nombre,presentacion,precio_lista,precio_sin_iva))')
        .order('creado_en', { ascending: false });
      if (all !== '1') {
        if (vendedor_id || usuario_id) {
          const uid = vendedor_id || usuario_id;
          query = query.or(`vendedor_id.eq.${uid},usuario_id.eq.${uid}`);
        }
      }
      if (cliente_id) query = query.eq('cliente_id', cliente_id);
      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const { usuario_id, vendedor_id, cliente_id, cedis_id, items, notas, direccion_entrega } = req.body;
      if (!usuario_id || !cedis_id || !items?.length) return res.status(400).json({ error: 'Faltan campos requeridos' });

      for (const item of items) {
        const { data: s } = await supabase.from('stock').select('cantidad').eq('cedis_id', cedis_id).eq('producto_id', item.producto_id).single();
        const disponible = s?.cantidad || 0;
        if (disponible === 0) {
          const { data: prod } = await supabase.from('productos').select('nombre,presentacion').eq('id', item.producto_id).single();
          return res.status(400).json({ error: `Sin stock: ${prod?.nombre||''} ${prod?.presentacion||''}. Contacta al administrador.` });
        }
        if (disponible < item.cantidad) {
          const { data: prod } = await supabase.from('productos').select('nombre,presentacion').eq('id', item.producto_id).single();
          return res.status(400).json({ error: `Stock insuficiente: ${prod?.nombre||''} ${prod?.presentacion||''}. Disponible: ${disponible}, solicitado: ${item.cantidad}.` });
        }
      }

      const total = items.reduce((a, i) => a + i.subtotal, 0);
      const { data: pedido, error } = await supabase.from('pedidos')
        .insert([{ usuario_id, vendedor_id: vendedor_id||null, cliente_id: cliente_id||null, cedis_id, total, notas, status: 'pendiente', direccion_entrega: direccion_entrega||null }])
        .select().single();
      if (error) throw error;
      await supabase.from('pedido_items').insert(items.map(i => ({ ...i, pedido_id: pedido.id })));
      return res.status(200).json({ ok: true, pedido });
    }

    if (req.method === 'PUT') {
      const { id, status } = req.body;
      if (!id || !status) return res.status(400).json({ error: 'Faltan campos' });

      // Get current pedido with all needed data
      const { data: p } = await supabase.from('pedidos')
        .select('status, vendedor_id, usuario_id, cliente_id, total, cedis_id, pedido_items(cantidad, producto_id, productos(presentacion))')
        .eq('id', id).single();
      const prevStatus = p?.status || 'pendiente';
console.log('PREV:', prevStatus, 'NEW:', status, 'needsComision:', TRIGGERS_COMISION.includes(status) && !TRIGGERS_COMISION.includes(prevStatus));

      // Update status
      const { error } = await supabase.from('pedidos').update({ status, actualizado_en: new Date() }).eq('id', id);
      if (error) throw error;

      const needsComision = TRIGGERS_COMISION.includes(status) && !TRIGGERS_COMISION.includes(prevStatus);
      const needsStock = TRIGGERS_STOCK.includes(status) && !TRIGGERS_STOCK.includes(prevStatus);

      // Descontar stock (only once - when first reaching enviado/entregado)
      if (needsStock && p?.pedido_items) {
        for (const item of p.pedido_items) {
          const { data: s } = await supabase.from('stock').select('cantidad')
            .eq('cedis_id', p.cedis_id).eq('producto_id', item.producto_id).single();
          if (s) {
            await supabase.from('stock').update({
              cantidad: Math.max(0, (s.cantidad||0) - item.cantidad),
              actualizado_en: new Date()
            }).eq('cedis_id', p.cedis_id).eq('producto_id', item.producto_id);
          }
        }
      }

      // Process commission (only once - when first reaching pagado/enviado/entregado)
      if (needsComision) {
        const vendId = p?.vendedor_id || p?.usuario_id;
        if (vendId) {
          const { data: usr } = await supabase.from('usuarios')
            .select('ventas_pagadas, compras_mes, comision_pct, rol, nivel, litros_mes')
            .eq('id', vendId).single();

          if (usr?.rol === 'vendedor') {
            // Calculate litros
            const litrosVendidos = (p.pedido_items||[]).reduce((a, item) => {
              const pres = item.productos?.presentacion || '1L';
              const liters = parseFloat(pres.replace(/[Ll]/g,'')) || 1;
              return a + (item.cantidad * liters);
            }, 0);

            const nuevosLitros = (usr.litros_mes || 0) + litrosVendidos;
            const nuevasVentas = (usr.ventas_pagadas || 0) + (p.total || 0);

            // Get config
            const { data: cfgRow } = await supabase.from('configuracion').select('valor').eq('clave', 'niveles_vendedor').single();
            const { data: cfgInm } = await supabase.from('configuracion').select('valor').eq('clave', 'comision_inmediata_pct').single();
            const nivelesVend = cfgRow ? JSON.parse(cfgRow.valor) : { semilla:{min_litros:0,pct:10}, verde:{min_litros:100,pct:15}, master:{min_litros:500,pct:18}, socio:{min_litros:1000,pct:20} };
            const pctInmediata = cfgInm ? parseFloat(cfgInm.valor) : 10;

            // Determine new nivel
            const nivelKeys = Object.entries(nivelesVend).sort((a,b) => b[1].min_litros - a[1].min_litros);
            let nuevoNivel = 'semilla';
            for (const [k, n] of nivelKeys) {
              if (nuevosLitros >= (n.min_litros||0)) { nuevoNivel = k; break; }
            }

            const pctVendedor = usr.comision_pct > 0 ? usr.comision_pct : (nivelesVend[nuevoNivel]?.pct || 10);
            const totalSinIva = (p.total || 0) / 1.16;
            const comisionInmediata = totalSinIva * pctInmediata / 100;
            const comisionTotal = totalSinIva * pctVendedor / 100;
            const comisionBono = Math.max(0, comisionTotal - comisionInmediata);

            // Next Thursday
            const today = new Date();
            const daysUntilThursday = ((4 - today.getDay() + 7) % 7) || 7;
            const nextThursday = new Date(today);
            nextThursday.setDate(today.getDate() + daysUntilThursday);

            // Update vendor
            await supabase.from('usuarios').update({
              ventas_pagadas: nuevasVentas,
              litros_mes: nuevosLitros,
              nivel: nuevoNivel
            }).eq('id', vendId);

            // Register commissions
            await supabase.from('comision_pagos').insert([{
              vendedor_id: vendId, pedido_id: id, monto_venta: totalSinIva,
              pct_aplicado: pctInmediata, monto_comision: comisionInmediata,
              tipo: 'inmediata', status: 'pendiente',
              fecha_pago_esperada: nextThursday.toISOString().split('T')[0]
            }]);

            if (comisionBono > 0.01) {
              await supabase.from('comision_pagos').insert([{
                vendedor_id: vendId, pedido_id: id, monto_venta: totalSinIva,
                pct_aplicado: pctVendedor - pctInmediata, monto_comision: comisionBono,
                tipo: 'bono_mensual', status: 'pendiente', fecha_pago_esperada: null
              }]);
            }

            // Update client
            if (p.cliente_id) {
              const { data: cli } = await supabase.from('clientes').select('comision_ganada,monto_vendido').eq('id', p.cliente_id).single();
              await supabase.from('clientes').update({
                comision_ganada: (cli?.comision_ganada||0) + comisionTotal,
                monto_vendido: (cli?.monto_vendido||0) + (p.total||0)
              }).eq('id', p.cliente_id);
            }

          } else {
            // Aplicador / distribuidor
            const nuevasCompras = (usr.compras_mes||0) + (p.total||0);
            await supabase.from('usuarios').update({
              compras_mes: nuevasCompras,
              nivel: getNivel(nuevasCompras)
            }).eq('id', vendId);
          }
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
