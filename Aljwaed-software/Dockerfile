# Dockerfile für die Aljwaed Software Anwendung
# Dieses Dockerfile sollte im Hauptverzeichnis Ihres Projekts liegen (z.B. ALJWAED_SOFTWARE/Dockerfile)

# --- Stufe 1: React Frontend bauen ---
FROM node:18-alpine AS react-builder
WORKDIR /app/frontend

# Kopiere package.json und package-lock.json (oder yarn.lock) des Frontends
COPY frontend/package*.json ./

# Installiere Frontend-Abhängigkeiten
RUN npm install

# Kopiere den gesamten Frontend-Quellcode
COPY frontend/ ./

# Setze Umgebungsvariablen für den Frontend-Build
# Diese können beim Docker-Build-Prozess über --build-arg übergeben werden,
# oder Sie können hier Standardwerte für die öffentliche Version definieren.
ARG REACT_APP_MODE_ARG=public
ENV REACT_APP_MODE=$REACT_APP_MODE_ARG

ARG REACT_APP_API_BASE_URL_ARG=/api # Für die Produktion zeigt die API auf denselben Host, relativer Pfad
ENV REACT_APP_API_BASE_URL=$REACT_APP_API_BASE_URL_ARG

# Das Upload-Token wird im Public-Build nicht benötigt, aber falls Sie ein Admin-Image bauen wollen:
# ARG REACT_APP_UPLOAD_TOKEN_ARG
# ENV REACT_APP_UPLOAD_TOKEN=$REACT_APP_UPLOAD_TOKEN_ARG

# Baue die React-Anwendung für die Produktion
RUN npm run build

# --- Stufe 2: Node.js Backend aufsetzen ---
FROM node:18-alpine AS backend-server
WORKDIR /app/server

# Umgebungsvariable für den Node-Umgebungsmodus
ENV NODE_ENV=production

# Kopiere package.json und package-lock.json des Backends
COPY aljwaed-Backend/package*.json ./

# Installiere Backend-Abhängigkeiten (nur Produktionsabhängigkeiten)
RUN npm install --omit=dev

# Kopiere den gesamten Backend-Quellcode
COPY aljwaed-Backend/ ./

# Kopiere die gebauten Frontend-Dateien aus der vorherigen Stufe
# Der Pfad im Backend-Code (REACT_BUILD_PATH) muss hierzu passen:
# path.join(__dirname, '..', 'frontend', 'build') wird zu /app/frontend/build im Container
COPY --from=react-builder /app/frontend/build /app/frontend/build

# Erstelle das Uploads-Verzeichnis, falls es nicht existiert (wird später durch ein Volume gemountet)
RUN mkdir -p /app/server/uploads

# Gib den Port frei, auf dem der Server lauschen wird (aus der Umgebungsvariable oder Standard)
# Der tatsächliche Port wird durch die Umgebungsvariable PORT beim Starten des Containers bestimmt.
# EXPOSE dokumentiert nur, welcher Port intern verwendet wird.
EXPOSE 5000

# Standard-Befehl zum Starten des Backend-Servers
# Der Server wird auf den durch die Umgebungsvariable PORT definierten Port lauschen,
# oder auf den Standardwert in server.js, falls PORT nicht gesetzt ist.
CMD ["node", "server.js"]
