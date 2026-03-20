const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://ybuwfzbxtjsvkcpymcbo.supabase.co',
  process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlidXdmemJ4dGpzdmtjcHltY2JvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMzkxNzQsImV4cCI6MjA4OTYxNTE3NH0.XL9czwelRyqiu-fiBDdAfq0ox_IMF1FsUDZTCpMYguE'
);

const cors = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

module.exports = { supabase, cors };
