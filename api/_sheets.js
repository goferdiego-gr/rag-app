const { google } = require('googleapis');

const SHEET_ID = '1p01SzDAK4_MynOHqQPNTfiX-_eNxl8w6I_ElIcCrGvs';

const CREDENTIALS = {
  type: "service_account",
  project_id: "third-camera-490804-q4",
  private_key_id: "aea287ebced77c9349952101a114554490e3efc6",
  private_key: process.env.GOOGLE_PRIVATE_KEY
    ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : null,
  client_email: "rag-app@third-camera-490804-q4.iam.gserviceaccount.com",
  client_id: "104597858978378867590",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token"
};

async function getSheets() {
  const auth = new google.auth.GoogleAuth({
    credentials: CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  return google.sheets({ version: 'v4', auth });
}

async function readSheet(range) {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range
  });
  return res.data.values || [];
}

async function appendRow(range, values) {
  const sheets = await getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: [values] }
  });
}

async function updateRow(range, values) {
  const sheets = await getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: [values] }
  });
}

async function initSheets() {
  const sheets = await getSheets();
  const headers = {
    'usuarios!A1': [['id','usuario','password','rol','aplicador_id','nombre']],
    'aplicadores!A1': [['id','nombre','zona','perfil','nivel','compras_mes','usuario']],
    'servicios!A1': [['id','aplicador_id','fecha','cliente','m2','producto','litros','notas','creado_en']],
    'comisiones!A1': [['mes','aplicador_id','servicios','bono_aplicacion','comision_pct','margen_producto','total']]
  };
  for (const [range, values] of Object.entries(headers)) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range,
      valueInputOption: 'RAW',
      requestBody: { values }
    });
  }
  const usuarios = await readSheet('usuarios!A:A');
  if (usuarios.length <= 1) {
    await appendRow('usuarios', ['u1','admin','grama2025','admin','','Admin Grama']);
  }
}

module.exports = { readSheet, appendRow, updateRow, initSheets, getSheets, SHEET_ID };
