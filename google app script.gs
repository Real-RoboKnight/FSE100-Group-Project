// Apps Script: Sheet API for Memories
// Paste this into the Apps Script editor and save

const SHEET_NAME = "Sheet1"; // change if your sheet tab has a different name

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) {
    return ContentService
      .createTextOutput(JSON.stringify([]))
      .setMimeType(ContentService.MimeType.JSON);
  }
  const headers = rows[0].map(h => String(h));
  const data = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = row[j];
    }
    data.push(obj);
  }
  const json = JSON.stringify(data || []);
  if (e.parameter && e.parameter.callback) {
    return ContentService
      .createTextOutput(`${e.parameter.callback}(${json})`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  // Accept JSON body or form-encoded. Append into the sheet.
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    // parse incoming data
    let payload = {};
    if (e.postData && e.postData.type === "application/json") {
      payload = JSON.parse(e.postData.contents || "{}");
    } else if (e.parameter && Object.keys(e.parameter).length) {
      payload = e.parameter;
    } else {
      // try parse as raw text
      try { payload = JSON.parse(e.postData && e.postData.contents) } catch(err){ payload = {}; }
    }

    // required fields: lat, lng, title, body (title/body can be empty strings)
    const lat = payload.lat || payload.latitude || "";
    const lng = payload.lng || payload.longitude || "";
    const title = payload.title || "";
    const body = payload.body || "";

    const ts = new Date();
    // Append row: timestamp, lat, lng, title, body
    sheet.appendRow([ts, lat, lng, title, body]);

    const result = { success: true, timestamp: ts.toISOString() };
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    const result = { success: false, error: err.toString() };
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }
}