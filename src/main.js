const { app, dialog, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const https = require('https');
const PROTOCOL_PFX = 'ghostprint://payload=';
const PROTOCOL = 'ghostprint';
const trimLength = PROTOCOL_PFX.length;
const { v4 } = require('uuid');
const { execFile } = require('child_process');

// Getting the path for the embedded JRE path and executable JAR path
winJrePath = path.join(process.resourcesPath, "electron-resources", "print", "win-jre", "bin", "java.exe");
jarPath = path.join(process.resourcesPath, "electron-resources", "print", "app-lib", "printpdf-1.0-jar-with-dependencies.jar");

/**
 * Function to show error in dialog box
 * 
 * @param {*} title 
 * @param {*} message 
 */
function showDialog(title, message) {
  dialog.showErrorBox(title, message);
}

/**
 * This function downloads the file from URL
 * 
 * @param {*} url 
 * @param {*} requestType
 * @param {*} payloadBody
 * @returns 
 */
async function downloadFile(url, requestType, payloadBody) {
  const axiosConfig = {
    url: url,
    responseType: 'stream',
    data: payloadBody
  };

  if (requestType.toLowerCase() === 'post') {
    axiosConfig.method = 'post';
  } else if (requestType.toLowerCase() === 'get') {
    axiosConfig.method = 'get';
  } else {
    showDialog('Invalid Request', 'Invalid request type. Use "post" or "get".');
    return Promise.reject(new Error('Invalid request type. Use "post" or "get".'));
  }

  return new Promise((resolve, reject) => {
    axios(axiosConfig)
      .then((response) => {
        const pdfFilePath = path.join(app.getPath('downloads'), v4() + '.pdf');
        const writer = fs.createWriteStream(pdfFilePath);
        response.data.pipe(writer);

        writer.on('finish', () => {
          resolve(pdfFilePath); // Resolve the Promise with the file name
        });

        writer.on('error', (error) => {
          showDialog('File Write Error', 'There was an error while writing the PDF file.');
          reject(error); // Reject the Promise on error
        });
      })
      .catch((error) => {
        showDialog('Download Error', 'There was an error while downloading the PDF file.');
        reject(error); // Reject the Promise on error
      });
  });
}

/**
 * This executes the actual print command
 *
 * @param {*} print_command
 * @returns
 */
async function executePrint(print_command) {
  const { printerName, pdfPath } = print_command;
  try{
    if (!pdfPath) {
      showDialog('Print Error', 'No PDF specified for printing.');
      return;
    }
    if (!fs.existsSync(pdfPath)) {
      showDialog('Print Error', `The specified PDF file ${pdfPath} does not exist.`);
      return;
    }
    const args = [];
    args.push('-jar');
    args.push(jarPath);
    args.push('-path');
    args.push(`${pdfPath}`);
    if (printerName) { // If not passed, it will be default printer
      args.push('-printer');
      args.push(`\"${printerName}\"`);
    }

    execFile(winJrePath, args, function (err, data) {
      if (err) {
        showDialog('Print Error', `There was an error while printing the PDF ${pdfPath}.`);
      }
      app.quit();
    });
  } catch(err) {
    showDialog('Error',err);
    app.quit();
  }
}

/* When Application starts, this section of code gets called */
app.whenReady().then(() => {
  app.setAsDefaultProtocolClient(PROTOCOL);
  let win = new BrowserWindow({ show: false });

  let print_command = {
    "pdfPath": null,
    "printerName": null
  }

  try {
    let encPayloadWithPfx = decodeURIComponent(process.argv[1]);
    let encPayload = encPayloadWithPfx.substring(trimLength);
    let encPayloadRefined = encPayload.substring(0, encPayload.length - 1);
    let payloadRefined = {};
    payloadRefined.payloadBody = undefined;
    payloadRefined.requestType = undefined;

    // Look for Printers
    win.webContents.getPrintersAsync().then(printers => {
      // Create Object from string
      payloadRefined = JSON.parse(encPayloadRefined);
      let errorOccurred = false;
      let selectedPrinter = null;
      let passedPrinterExists = false;

      // If Printer has been passed, then validate the Printer Name
      if(payloadRefined.printerName){
        printers.forEach(printer => {
          if(payloadRefined.printerName===printer.name){
            passedPrinterExists = true;
          }
        })
      }
      // Set the printer name if found
      if(passedPrinterExists){
        selectedPrinter = payloadRefined.printerName;
      }else{
        if(payloadRefined.printerName){
          showDialog('Error',`Printer ${payloadRefined.printerName} is not found`);
          errorOccurred = true;
          app.quit();
        }
        // App will try to print using default printer if printer name was not passed
      }

      // If no error then, continue downloading PDF document
      if(!errorOccurred){
        // Download File
        downloadFile(payloadRefined.url, payloadRefined.requestType, payloadRefined.payloadBody)
            .then((pdfPath) => {
              print_command.pdfPath = pdfPath;
              print_command.printerName = selectedPrinter;
              // Perform Print
              executePrint(print_command)
                  .catch((err) => {
                    showDialog('Print Error',err);
                    app.quit();
                  });
            })
            .catch((error)=>{
              showDialog('Error Downloading: ',error);
              app.quit();
            });
      }
    }).catch((err) => {
      showDialog('No Printer found',err.toString());
      app.quit();
    });
  } catch (error) {
    showDialog('Error',error);
    app.quit();
  }
});
