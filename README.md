Document printing is a ubiquitous requirement in manufacturing environments, with users needing to print labels and PDFs at various stages of their workflows.

Our specific use case involved downloading PDF documents from pre-signed URLs and printing them using either the system's default printer or a designated printer without prompting the user to select a printer (silent printing).

This could be achieved in many ways.

* **Browser Plugin** - Users can install a browser plugin to initiate printing. But this would require us to create separate plugins and additionally, every user would have to install the plugin onto their preferred browser. The users don't have that permission.
    
* **Kiosk Mode** - Kiosk mode can print a web page with a simple `window.print()` function in JavaScript. Kiosk mode is not applicable in our case as we have a general-purpose web application that is not running in a very controlled environment where a kiosk runs.
    
* **Local Print Server** - We could set up a local print server that can be accessed through an API from the user's browser. When a link is clicked, the server receives a request to send the document directly to the printer. However, setting up a local print server involves additional technical and administrative challenges.
    
* **Automated Silent Printing Using a Desktop Application** - We can create a browser extension or web application that intercepts print requests. By extracting the necessary information from the request, the application can silently download the document and start the printing process, bypassing the standard print dialog.
    

The fourth solution, *Automated Silent Printing Using a Desktop Application* appears to be the most practical option for our needs. It offers centralized control over the entire printing process, ensuring compatibility across various browsers without requiring a local print server.

We created an Electron application using JavaScript. Why an Electron app and not anything else? That's because we have a team consisting of mostly Java/Spring developers for the back end and some JavaScript/React developers for the front end. I had earlier worked on a POC to interface with handheld scanners for an earlier project which was built using ElectronJS. Considering the team composition and prior experience, we went on to create an Electron application.

**This is how the Printing application would work:**

* Initiate the printing application with a request payload containing the information required for printing
    
* The printing application extracts information from the payload
    
* The document is downloaded
    
* A print job is initiated by the printing application
    

**Prerequisite**: Create a basic Electron App. Following the basic [getting started tutorial](https://www.electronjs.org/docs/latest/tutorial/quick-start) from the [electronjs official website](https://www.electronjs.org/).

**1. Invoking the printing application** - On our web page, we can have a custom URL that could have a certain [protocol](https://www.electronjs.org/docs/latest/api/protocol). For example, we have a URL [https://google.com](https://google.com). Here, *https* is the protocol, and it's handled by browsers. We can create a custom protocol that can be handled by our custom application.

Let's give our protocol a name: *ghostprint*

When the app's 'ready' event is fired, we can add the following code to set the application as the default handler for our protocol:

```javascript
app.setAsDefaultProtocolClient("ghostprint");
pp.whenReady().then(() => {
	app.setAsDefaultProtocolClient(PROTOCOL); // Registers this app as handler of the protocol "noprmptprnt"
	// More code ...
}
```

Read more about `setAsDefaultProtocolClient()` function [here](https://www.electronjs.org/docs/latest/api/app#appsetasdefaultprotocolclientprotocol-path-args)

Let's write a simple JavaScript code to call our application using a custom protocol. This code is run when a button with the id `PrintBtn` is clicked on a web page:

```javascript
$('#PrintBtn').on('click', function(event){
	event.preventDefault();
	const PROTOCOL_PFX = "ghostprint://payload=";
	const payLoad = {
		"url": "https://pdfobject.com/pdf/sample.pdf",
		"requestType": "get",
		"payloadBody":{"data":"dummy"},
		"printerName":"Microsoft Print to PDF"
	}
	payloadEnc = encodeURIComponent(JSON.stringify(payLoad));
	window.location.href = PROTOCOL_PFX+payloadEnc; // Calls our printing app
});
```

You can extract information from the `payLoad` which will contain information about the Print Instructions.

**2. Get the list of printers attached with the system** - Once you extract the printing instructions, you have every information needed for performing the printing. But before you start printing, you have to get the list of printers attached to the system.

```JavaScript
win.webContents.getPrintersAsync().then(printers => {
	// More Code ...
	// 
	if(payloadRefined.printerName){  
		printers.forEach(printer => {  
			if(payloadRefined.printerName===printer.name){  
				passedPrinterExists = true;  
			}
		})
	}
	// More Code ...
}
```

**3. Download file** - If a printer is found, you can start downloading the file. The file URL can be found in the Payload. We are using [Axios](https://axios-http.com/docs/intro) for downloading the file.

```JavaScript
async function downloadFile(url, requestType, payloadBody) {  
  const axiosConfig = {  
    url: url,  
    responseType: 'stream',  
    data: payloadBody  
  };  
  
  // More Code...
  
  return new Promise((resolve, reject) => {  
    axios(axiosConfig)  
      .then((response) => {
		// generating file name
        const pdfFilePath = path.join(app.getPath('downloads'), v4() + '.pdf');  
        const writer = fs.createWriteStream(pdfFilePath);  
        response.data.pipe(writer);  
  
        writer.on('finish', () => {  
          resolve(pdfFilePath);
        });  
		// More Code...  
      });  
  });  
}
```

**4. Printing** - Printing can be achieved by simply calling an embedded executable file. You can find many solutions which uses [SumatraPDF](https://www.sumatrapdfreader.org/) which supports an extensive set of Command Line Arguments that are very well documented [here](https://www.sumatrapdfreader.org/docs/Command-line-arguments). There is an NPM library [pdf-to-print](https://www.npmjs.com/package/pdf-to-printer) you can use for this purpose. You can have a look at a very good article [Printing PDF in Node.js with Electron](https://levelup.gitconnected.com/printing-pdf-in-node-js-with-electron-electronforge-pdf-to-printer-webpack-b5c18209cf88) to see how it works. 

But we wanted to be in total control of the printing process. We are primarily a Java development team and have enough experienced Java Developers. So, we ended up writing a small Java Program using [Apache PDFBox](https://pdfbox.apache.org/) library. We also had to embed JRE inside the application distribution to ensure that the JRE is not required to be installed separately. 

**The java Program**
```Java
import org.apache.pdfbox.pdmodel.PDDocument;  
import org.apache.pdfbox.printing.PDFPageable;  
import org.apache.pdfbox.Loader;  
  
import javax.print.PrintService;  
import javax.print.PrintServiceLookup;  
import java.awt.print.PrinterJob;  
import java.io.File;  
import java.io.IOException;  
  
public class PDFPrinter {  
    public static void main(String[] args) {  
        
        // More code  ...
        
        for(int i = 0; i<args.length; i=i+2){  
            String flag = args[i];  
            String value = args[i+1];  
            // Validate the parameters...
        }  
        printPDF(pdfPath, printerName);  
    }  
    public static void printPDF(String pdfPath, String printerName) {  
        
        // More Code...
        
		// Find the specified print service  
		PrintService[] printServices = PrintServiceLookup.lookupPrintServices(null, null);  
		PrintService printService = null;  
		if(printerName!=null && !printerName.isBlank()) {  
			for (PrintService service : printServices) {  
				if (service.getName().equalsIgnoreCase(printerName.replace("\"",""))) {  
					printService = service;  
					break;  
				}  
			}  
			if (printService == null) {  
				System.err.println("Printer not found: " + printerName);  
				System.exit(1);  
			} else {  
				job.setPrintService(printService);  
			}  
		} else{  
			// Find the default print service  
			printService = PrintServiceLookup.lookupDefaultPrintService();  
			if (printService != null) {  
				job.setPrintService(printService);  
			}  
		}  

		// Set the document to be printed  
		job.setPageable(new PDFPageable(document));  

		// Print the document  
		job.print();  
		
		// More Code...
    
    }  
}
```

Generate an executable jar with all the required dependencies.

**Embed JRE and the JAR file** - In the `package.json` file, add the following code in `build` section

```JavaScript
"build": {

	"extraResources": [  
	{  
	    "from": "local-resources/print/",  
	    "to": "electron-resources/print"  
	}

]
```

Inside the project directory, create the following structure and place the jar and JRE
```
.
└───ghostprint
	└───print
	    ├───app-lib
		|   └───<executable-jar-with-dependencies>
	    └───win-jre
		    └───<place JRE content here>
	    
```

**Calling the JAR with parameters** - Use `execFile()` function from `child_process` to run the executable JAR file

```JavaScript
async function executePrint(print_command) {  
  const { printerName, pdfPath } = print_command;  
  try{  
    // More Code ...
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
```

You can check out the repo code (You must add JRE content). You can run 
1. `npm install` 
2. `npm run dist`

The Windows installer file `ghostprint Setup 0.0.1.exe` will be generated inside the `dist` directory. Once you install this in Windows, you can invoke printing from any button by calling the following JavaScript function.

```javaScript
$('#PrintBtn').on('click', function(event){
	event.preventDefault();
	const PROTOCOL_PFX = "ghostprint://payload=";
	const payLoad = {
		"url": "https://pdfobject.com/pdf/sample.pdf",
		"requestType": "get",
		"payloadBody":{"data":"dummy"},
		"printerName":"Microsoft Print to PDF"
	}
	payloadEnc = encodeURIComponent(JSON.stringify(payLoad));
	window.location.href = PROTOCOL_PFX+payloadEnc; // Calls our printing app
});
```

### Disclaimer
The code provided here is a sample code, enough to give you an idea about what can be done. This code is not production ready and there is no optimization. The code that was finally deployed in production has a lot of added functionalities and security features. But this will give you a base to start with.

**Repo:**
<br>
The Electron App code: https://github.com/subinoy-roy/ghostprint
<br>
The Java Program: https://github.com/subinoy-roy/ghostprintcompanion
