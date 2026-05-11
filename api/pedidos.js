const { supabase, cors } = require('./_supabase');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {

    // ── GET ──────────────────────────────────────────────────────────────────
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

    // ── POST ─────────────────────────────────────────────────────────────────
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
          cedis_id, total, notas: notasConAviso, status: 'pendiente', direccion_entrega: direccion_entrega||null }])
        .select().single();
      if (error) throw error;
      await supabase.from('pedido_items').insert(items.map(i => ({ ...i, pedido_id: pedido.id })));
      return res.status(200).json({ ok: true, pedido });
    }

    // ── PUT ──────────────────────────────────────────────────────────────────
    if (req.method === 'PUT') {
      const { id, status } = req.body;
      if (!id || !status) return res.status(400).json({ error: 'Faltan campos' });

      // Leer pedido actual
      const { data: p, error: readErr } = await supabase.from('pedidos')
        .select('status, vendedor_id, usuario_id, cliente_id, total, cedis_id, creado_en, pedido_items(cantidad, producto_id, productos(presentacion))')
        .eq('id', id).single();
      if (readErr) throw readErr;

      const prevStatus = p.status || 'pendiente';
      
      // Si el nuevo status es "entregado", tratarlo como pagado+enviado
      // Actualizar estado
      const { error: updErr } = await supabase.from('pedidos')
        .update({ status, actualizado_en: new Date() }).eq('id', id);
      if (updErr) throw updErr;

      // ── Descontar Stock (solo si status es enviado o entregado) ────────────
      if ((status === 'enviado' || status === 'entregado') && 
          prevStatus !== 'enviado' && prevStatus !== 'entregado') {
        if (p.pedido_items?.length) {
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
      }

      // ── COMISIONES SIMPLIFICADAS (v15) ──────────────────────────────────
      // Se registra comisión cuando status es 'pagado' o 'entregado'
      // La comisión se calcula SOLO una vez (si no existía antes)
      if ((status === 'pagado' || status === 'entregado') && 
          prevStatus !== 'pagado' && prevStatus !== 'entregado') {
        
        const vendId = p.vendedor_id || p.usuario_id;
        if (vendId) {
          // Obtener datos del vendedor
          const { data: usr } = await supabase.from('usuarios')
            .select('id, rol, litros_mes, ventas_mes')
            .eq('id', vendId).single();
          
          if (usr && usr.rol === 'vendedor') {
            // Calcular litros del pedido
            const litrosPedido = (p.pedido_items||[]).reduce((acc, item) => {
              const pres = item.productos?.presentacion || '1L';
              const match = pres.match(/(\d+\.?\d*)\s*[Ll]/);
              const liters = match ? parseFloat(match[1]) : 1;
              return acc + (item.cantidad * liters);
            }, 0);

            const nuevosLitros = (usr.litros_mes || 0) + litrosPedido;
            const nuevasVentas = (usr.ventas_mes || 0) + (p.total || 0);

            // Obtener configuración de niveles y comisión inmediata
            const { data: cfgNiveles } = await supabase.from('configuracion')
              .select('valor').eq('clave', 'niveles_vendedor').single();
            const { data: cfgInmediata } = await supabase.from('configuracion')
              .select('valor').eq('clave', 'comision_inmediata_pct').single();

            const nivelesConfig = cfgNiveles 
              ? JSON.parse(cfgNiveles.valor)
              : { semilla:{min_litros:0,pct:10}, verde:{min_litros:100,pct:15}, master:{min_litros:500,pct:18}, socio:{min_litros:1000,pct:20} };
            const pctInmediata = cfgInmediata ? parseFloat(cfgInmediata.valor) : 10;

            // Determinar nivel según litros acumulados
            const sorted = Object.entries(nivelesConfig).sort((a,b) => b[1].min_litros - a[1].min_litros);
            let nuevoNivel = 'semilla';
            for (const [k, n] of sorted) {
              if (nuevosLitros >= (n.min_litros || 0)) { 
                nuevoNivel = k; 
                break; 
              }
            }

            // Porcentaje a aplicar
            const pctNivel = nivelesConfig[nuevoNivel]?.pct || 10;

            // Cálculo sin IVA
            const totalSinIva = (p.total || 0) / 1.16;
            const comisionInmediata = totalSinIva * pctInmediata / 100;
            const comisionBono = totalSinIva * (pctNivel - pctInmediata) / 100;

            // Próximo jueves
            const hoy = new Date();
            const diasParaJueves = ((4 - hoy.getDay() + 7) % 7) || 7;
            const jueves = new Date(hoy);
            jueves.setDate(hoy.getDate() + diasParaJueves);

            // Actualizar stats del vendedor
            await supabase.from('usuarios').update({
              litros_mes: nuevosLitros,
              ventas_mes: nuevasVentas,
              nivel: nuevoNivel
            }).eq('id', vendId);

            // Registrar comisión inmediata
            await supabase.from('comision_pagos').insert([{
              vendedor_id: vendId,
              pedido_id: id,
              monto_venta: totalSinIva,
              pct_aplicado: pctInmediata,
              monto_comision: comisionInmediata,
              tipo: 'inmediata',
              status: 'pendiente',
              fecha_pago_esperada: jueves.toISOString().split('T')[0]
            }]);

            // Registrar bono si hay
            if (comisionBono > 0.01) {
              await supabase.from('comision_pagos').insert([{
                vendedor_id: vendId,
                pedido_id: id,
                monto_venta: totalSinIva,
                pct_aplicado: pctNivel - pctInmediata,
                monto_comision: comisionBono,
                tipo: 'bono_mensual',
                status: 'pendiente',
                fecha_pago_esperada: null
              }]);
            }

            // Actualizar stats del cliente si existe
            if (p.cliente_id) {
              const { data: cli } = await supabase.from('clientes')
                .select('monto_vendido').eq('id', p.cliente_id).single();
              await supabase.from('clientes').update({
                monto_vendido: (cli?.monto_vendido||0) + (p.total||0)
              }).eq('id', p.cliente_id);
            }
          }
        }
      }

      return res.status(200).json({ ok: true });
    }

    // ── DELETE ───────────────────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const { id, usuario_id } = req.query;
      if (!id || !usuario_id) {
        return res.status(400).json({ error: 'ID de pedido y usuario requeridos' });
      }

      try {
        const { data: pedido, error: readErr } = await supabase.from('pedidos')
          .select('id, status, vendedor_id, usuario_id')
          .eq('id', id)
          .single();

        if (readErr || !pedido) {
          return res.status(404).json({ error: 'Pedido no encontrado' });
        }

        const esPropietario = pedido.vendedor_id === usuario_id || pedido.usuario_id === usuario_id;
        if (!esPropietario) {
          return res.status(403).json({ error: 'No tienes permiso para eliminar este pedido' });
        }

        if (pedido.status !== 'pendiente') {
          return res.status(400).json({ 
            error: `No se puede eliminar un pedido en estado '${pedido.status}'. Solo se pueden eliminar pedidos pendientes.` 
          });
        }

        const { error: itemsErr } = await supabase.from('pedido_items')
          .delete()
          .eq('pedido_id', id);

        if (itemsErr) throw itemsErr;

        const { error: delErr } = await supabase.from('pedidos')
          .delete()
          .eq('id', id);

        if (delErr) throw delErr;

        return res.status(200).json({ 
          ok: true, 
          message: 'Pedido eliminado correctamente' 
        });
      } catch (error) {
        console.error('Error eliminando pedido:', error);
        return res.status(500).json({ error: error.message });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('PEDIDOS ERROR:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
