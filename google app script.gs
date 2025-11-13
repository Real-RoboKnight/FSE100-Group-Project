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
  // Accept JSON body or form-encoded. Append or update rows in the sheet.
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
    Logger.log("Parsed payload: " + JSON.stringify(payload));

    // Check if this is an update request (has uuid field)
    if (payload.uuid) {
      return handleUpdate(sheet, payload);
    }

    // Otherwise, create new memory
    const lat = payload.lat || payload.latitude || "";
    const lng = payload.lng || payload.longitude || "";
    const title = payload.title || "";
    const body = payload.body || "";
    const icon = payload.icon || "debug";
    const timestamp = new Date();
    const lastupdated = new Date();

    Logger.log(`Appending: ${[timestamp.toISOString(), lat, lng, title, body, icon, lastupdated].join(", ")}`);
    
    // Append row: timestamp, lat, lng, title, body, icon
    sheet.appendRow([timestamp, lat, lng, title, body, icon, lastupdated]);

    const result = { success: true, timestamp: timestamp.toISOString() };
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

function handleUpdate(sheet, payload) {
  const uuid = payload.uuid; // This should be the timestamp ISO string
  const rows = sheet.getDataRange().getValues();
  
  // Find the row with matching timestamp
  let rowIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    const rowTimestamp = rows[i][0];
    // Convert to ISO string for comparison
    const rowTimestampStr = rowTimestamp instanceof Date 
      ? rowTimestamp.toISOString() 
      : String(rowTimestamp);
    
    if (rowTimestampStr === uuid) {
      rowIndex = i + 1; // +1 because sheet rows are 1-indexed
      break;
    }
  }
  
  if (rowIndex === -1) {
    return ContentService
      .createTextOutput(JSON.stringify({ 
        success: false, 
        error: "Memory not found with timestamp: " + uuid 
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  // Update the row with new values (keep existing if not provided)
  const currentRow = rows[rowIndex - 1];
  const newTimestamp = payload.timestamp ? new Date(payload.timestamp) : currentRow[0];
  const lat = payload.lat !== undefined ? payload.lat : currentRow[1];
  const lng = payload.lng !== undefined ? payload.lng : currentRow[2];
  const title = payload.title !== undefined ? payload.title : currentRow[3];
  const body = payload.body !== undefined ? payload.body : currentRow[4];
  const icon = payload.icon !== undefined ? payload.icon : currentRow[5];
  const lastupdated = new Date();
  
  Logger.log(`Updating row ${rowIndex}: ${[newTimestamp, lat, lng, title, body, icon, lastupdated].join(", ")}`);
  
  sheet.getRange(rowIndex, 1, 1, 7).setValues([[newTimestamp, lat, lng, title, body, icon, lastupdated]]);
  
  const result = { 
    success: true, 
    updated: true,
    timestamp: newTimestamp instanceof Date ? newTimestamp.toISOString() : newTimestamp
  };
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}