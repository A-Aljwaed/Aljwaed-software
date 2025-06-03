// aljwaed-Backend/server.js
require('dotenv').config(); // GANZ OBEN: Lädt Variablen aus .env in process.env

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises; // Using promises version of fs
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
// PORT wird aus .env gelesen, dann process.env.PORT (vom Hoster), dann Fallback auf 5000
const PORT = process.env.PORT || 5000;

// Das Secret Token wird aus der Umgebungsvariable gelesen
const MY_SECRET_UPLOAD_TOKEN = process.env.UPLOAD_TOKEN;

if (!MY_SECRET_UPLOAD_TOKEN) {
    console.error("FATAL ERROR: UPLOAD_TOKEN ist nicht in den Umgebungsvariablen gesetzt!");
    console.error("Bitte erstellen Sie eine .env Datei im 'aljwaed-Backend' Verzeichnis mit UPLOAD_TOKEN='IhrGeheimesToken'");
    console.error("ODER setzen Sie die Umgebungsvariable auf Ihrem Hosting-Server.");
    // Für eine Produktivumgebung sollten Sie den Prozess hier beenden, wenn das Token fehlt:
    // process.exit(1);
} else {
    console.log("UPLOAD_TOKEN wurde erfolgreich aus der Umgebung geladen.");
}


// --- Configuration ---
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const METADATA_FILE = path.join(__dirname, 'metadata.json');
const REACT_BUILD_PATH = path.join(__dirname, '..', 'frontend', 'build');

// --- Middleware ---
app.use(cors()); // Enable CORS for all routes (useful for development)
app.use(express.json()); // To parse JSON bodies
app.use(express.urlencoded({ extended: true })); // To parse URL-encoded bodies

// Ensure uploads directory exists
(async () => {
    try {
        await fs.mkdir(UPLOADS_DIR, { recursive: true });
        // Ensure metadata file exists
        try {
            await fs.access(METADATA_FILE);
        } catch (error) {
            await fs.writeFile(METADATA_FILE, JSON.stringify([]));
        }
    } catch (err) {
        console.error("Error ensuring uploads directory or metadata file exists:", err);
    }
})();

// --- Multer Setup for File Uploads ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOADS_DIR);
    },
    filename: function (req, file, cb) {
        // Generate a unique filename to prevent overwrites and handle special characters
        const uniqueSuffix = uuidv4();
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (path.extname(file.originalname).toLowerCase() !== '.exe') {
            return cb(new Error('Only .exe files are allowed!'), false);
        }
        cb(null, true);
    },
    limits: {
        fileSize: 1024 * 1024 * 200 // 200MB limit (adjust as needed)
    }
});


// --- API Routes ---

// Read metadata
async function readMetadata() {
    try {
        const data = await fs.readFile(METADATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading metadata:', error);
        if (error.code === 'ENOENT') { // If file doesn't exist, return empty array
            return [];
        }
        throw error; // Re-throw other errors
    }
}

// Write metadata
async function writeMetadata(data) {
    try {
        await fs.writeFile(METADATA_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error writing metadata:', error);
        throw error;
    }
}

// POST /api/software/upload
app.post('/api/software/upload', (req, res) => {
    // Token-Überprüfung hier GANZ OBEN in der Route
    const providedToken = req.headers['x-upload-token'];

    if (!MY_SECRET_UPLOAD_TOKEN) { // Überprüfen, ob das Server-Token überhaupt konfiguriert ist
        console.error("UPLOAD_TOKEN ist serverseitig nicht konfiguriert. Upload abgelehnt.");
        return res.status(500).json({ message: 'Server configuration error regarding upload token.' });
    }

    if (providedToken !== MY_SECRET_UPLOAD_TOKEN) {
        console.warn("Unauthorized upload attempt: Invalid or missing token.");
        return res.status(401).json({ message: 'Unauthorized: Invalid or missing upload token.' });
    }

    // Wenn Token korrekt ist, fahre mit dem Upload fort
    upload.single('softwareFile')(req, res, async function (err) {
        if (err instanceof multer.MulterError) {
            console.error("Multer error:", err);
            return res.status(400).json({ message: `File upload error: ${err.message}` });
        } else if (err) {
            console.error("Unknown upload error:", err);
            return res.status(400).json({ message: err.message || 'Unknown upload error' });
        }

        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded.' });
        }

        const { softwareName, softwareVersion, softwareDescription } = req.body;
        if (!softwareName) {
            try {
                await fs.unlink(req.file.path);
            } catch (unlinkErr) {
                console.error("Error deleting orphaned file:", unlinkErr);
            }
            return res.status(400).json({ message: 'Software name is required.' });
        }

        try {
            const metadata = await readMetadata();
            const newSoftware = {
                id: uuidv4(),
                name: softwareName,
                version: softwareVersion || '',
                description: softwareDescription || '',
                originalFilename: req.file.originalname,
                serverFilename: req.file.filename, 
                uploadedAt: new Date().toISOString(),
                size: req.file.size
            };
            metadata.push(newSoftware);
            await writeMetadata(metadata);
            res.status(201).json({ message: 'Software uploaded successfully!', software: newSoftware });
        } catch (error) {
            console.error("Error saving metadata:", error);
            try {
                await fs.unlink(req.file.path);
            } catch (unlinkErr) {
                console.error("Error deleting file after metadata failure:", unlinkErr);
            }
            res.status(500).json({ message: 'Error saving software metadata.' });
        }
    });
});

// GET /api/software
app.get('/api/software', async (req, res) => {
    try {
        const metadata = await readMetadata();
        metadata.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
        res.json(metadata);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching software list.' });
    }
});

// GET /api/software/download/:serverFilename
app.get('/api/software/download/:serverFilename', async (req, res) => {
    const { serverFilename } = req.params;
    const filePath = path.join(UPLOADS_DIR, serverFilename);

    try {
        if (serverFilename.includes('..') || serverFilename.includes('/')) {
            return res.status(400).send('Invalid filename.');
        }
        await fs.access(filePath); 

        const metadata = await readMetadata();
        const softwareInfo = metadata.find(s => s.serverFilename === serverFilename);
        const originalFilename = softwareInfo ? softwareInfo.originalFilename : serverFilename;

        res.download(filePath, originalFilename, (err) => {
            if (err) {
                console.error("Error during download:", err);
                if (!res.headersSent) { 
                    res.status(404).send('File not found or error during download.');
                }
            }
        });
    } catch (error) {
        console.error("File access error:", error);
        res.status(404).send('File not found.');
    }
});


// --- Serve React Frontend ---
app.use(express.static(REACT_BUILD_PATH));

app.get('*', (req, res) => {
    const indexPath = path.join(REACT_BUILD_PATH, 'index.html');
     fs.access(indexPath)
        .then(() => res.sendFile(indexPath))
        .catch((err) => { // Fehlerbehandlung, falls index.html nicht gefunden wird
            console.error(`React index.html not found at ${indexPath}`, err.message);
            res.status(404).send(
                `React app not found. Please ensure the frontend is built and the path is correct. Expected at: ${REACT_BUILD_PATH}`
            );
        });
});


// --- Start Server ---
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Aljwaed Backend server running on http://0.0.0.0:${PORT}`);
    console.log(`Serving React app from: ${REACT_BUILD_PATH}`);
    console.log(`Storing uploads in: ${UPLOADS_DIR}`);
    console.log(`Storing metadata in: ${METADATA_FILE}`);
    if (MY_SECRET_UPLOAD_TOKEN) { // Nur warnen, wenn das Token auch wirklich aus der .env geladen wurde
        console.warn("INFO: Upload endpoint is protected by a token.");
    } else {
        console.error("CRITICAL WARNING: UPLOAD_TOKEN is NOT SET. The upload endpoint is effectively UNSECURED if no token logic is present or if token is undefined!");
    }
});