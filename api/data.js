const { supabase, cors } = require('./_supabase');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { resource } = req.query;

  try {
    if (req.method === 'GET') {
      if (resource === 'productos') {
        const { data, error } = await supabase.from('productos').select('*').eq('activo', true).order('nombre');
        if (error) throw error;
        return res.status(200).json(data);
      }
      if (resource === 'cedis') {
        const { data, error } = await supabase.from('cedis').select('*');
        if (error) throw error;
        return res.status(200).json(data);
      }
      if (resource === 'stock') {
        const { data, error } = await supabase.from('stock').select('*, cedis(nombre,ciudad), productos(nombre,presentacion)');
        if (error) throw error;
        return res.status(200).json(data);
      }
      if (resource === 'config') {
        const { data, error } = await supabase.from('configuracion').select('*');
        if (error) throw error;
        return res.status(200).json(data);
      }
    }

    if (req.method === 'PUT') {
      if (resource === 'config') {
        const { clave, valor } = req.body;
        const { error } = await supabase.from('configuracion')
          .update({ valor: JSON.stringify(valor), actualizado_en: new Date() })
          .eq('clave', clave);
        if (error) throw error;
        return res.status(200).json({ ok: true });
      }
      if (resource === 'stock') {
        const { cedis_id, producto_id, cantidad } = req.body;
        const { error } = await supabase.from('stock')
          .upsert({ cedis_id, producto_id, cantidad, actualizado_en: new Date() }, { onConflict: 'cedis_id,producto_id' });
        if (error) throw error;
        return res.status(200).json({ ok: true });
      }
      if (resource === 'productos') {
        const { id, precio_lista } = req.body;
        const { error } = await supabase.from('productos').update({ precio_lista }).eq('id', id);
        if (error) throw error;
        return res.status(200).json({ ok: true });
      }
    }

    return res.status(400).json({ error: 'Recurso no valido' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
